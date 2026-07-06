# Code Refactor Roadmap — Phase A 後的 21 page 改造手冊

> **目的**：Phase A migrations 套用到 production 之後，現有 `app/` 與 `lib/` 程式碼需要全面 retrofit 才能配合新架構運作。本文件列出每個檔案的具體改動清單、code skeleton、驗證點與時程估計。
> **撰寫日期**：2026-05-08（Telly 出差期間，Claude 撰寫）
> **適用時機**：Phase A migrations 套用完成、Auth Hook 設定完成之後
> **規範來源**：[`backend-conventions.md`](./backend-conventions.md)、[`week0-page-audit.md`](./week0-page-audit.md)
> **預估總工時**：30-45 小時（Telly 1 個人 + 偶爾 Claude 協助），約等於 Phase B 第 4-5 週的工作量

---

## 0. 整體策略

### 0.1 為什麼不能「migration 套了就完事」

Phase A migration 改的是 schema，但應用程式碼還在用「舊式單租戶 + 明文 + 無 RLS」的寫法。如果不 refactor：

- ❌ INSERT 漏 tenant_id → RLS WITH CHECK 拒絕 → 老師看到「儲存失敗」
- ❌ SELECT 加密欄位 → 直接拿到 BYTEA 亂碼 → UI 顯示亂碼
- ❌ 沒寫 access_log → 個資合規破口
- ❌ 沒寫 operational_events → 研究素材累積不到

**簡單說：migration + Code Refactor 是配套的，缺一不可**。

### 0.2 三大改造原則

#### 原則 1：先改 lib/ 再改 app/

`lib/` 是基礎建設（Supabase client、encryption helper、event tracking），所有 page 都依賴。先把 lib/ 改完並驗證，才動 page。

#### 原則 2：一次改一頁，驗證完才動下一頁

不要「全部一次改」。**一頁改完上 staging → 跑驗證 → 確認沒退化 → 才繼續下一頁**。

理由：multi-tenant 改造容易引入隱性 bug（query 漏 tenant filter、加密欄位忘記解密），一頁一頁改才能精確抓出問題的來源。

#### 原則 3：每改一頁都更新 `04_quantitative_data.md`（Phase C 用的）

改完之後，那頁產生的 `operational_events` 要進得了 baseline 報告。所以改 page 時記得「同時加入 operational_events 寫入點」。

### 0.3 改造順序（先後相依）

```
1. lib/ 全部改 + 驗證               ← 階段 1（1-2 天）
2. app/ Auth 4 頁                  ← 階段 2（1 天）
3. app/ 讀為主的頁面               ← 階段 3（2-3 天）
4. app/ CRUD 頁面 — 學生為核心      ← 階段 4（3-5 天）
5. app/ CRUD 頁面 — 其他            ← 階段 5（5-7 天）
6. app/ 管理層頁面 + 修 P1 P2 bug   ← 階段 6（3-4 天）
7. 整體 e2e 驗證                    ← 階段 7（1-2 天）
─────────────────────────────────────────────────────
總計：約 4 週（與 v3.0 §5.5 Phase B 規劃對齊）
```

---

## 1. 階段 1：lib/ 改造（基礎建設）

### 1.1 改 `lib/supabaseClient.ts` — 從單一 client 變三層

**現況**：

```typescript
// lib/supabaseClient.ts （目前）
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
```

**改成（拆三個檔）**：

#### `lib/supabaseClient.ts`（browser-side）

```typescript
// lib/supabaseClient.ts
// Browser-side Supabase client — uses anon key + user JWT
// Subject to RLS isolation per tenant
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Convenience singleton for client components
let _client: ReturnType<typeof createSupabaseBrowserClient> | null = null;
export function getSupabaseBrowserClient() {
  if (!_client) _client = createSupabaseBrowserClient();
  return _client;
}
```

#### `lib/supabaseServer.ts`（server-side, SSR）

```typescript
// lib/supabaseServer.ts
// Server-side Supabase client — uses cookies for auth
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSecretsFromVault } from './secrets';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => {
          try { cookieStore.set({ name: n, value: v, ...o }); } catch {}
        },
        remove: (n, o) => {
          try { cookieStore.set({ name: n, value: '', ...o }); } catch {}
        },
      },
    }
  );
}

// Server client that ALSO sets session encryption keys.
// Use this when you'll be reading/writing encrypted fields in the same request.
export async function createSupabaseServerClientWithCrypto() {
  const supabase = createSupabaseServerClient();
  const { encryptionKey, hashKey } = await getSecretsFromVault();
  
  const { error } = await supabase.rpc('set_session_keys', {
    p_encryption_key: encryptionKey,
    p_hash_key: hashKey,
  });
  
  if (error) {
    console.error('[supabaseServer] set_session_keys failed:', error.message);
    throw new Error('Encryption key setup failed');
  }
  
  return supabase;
}
```

#### `lib/supabaseAdmin.ts`（service_role, **server-only**）

```typescript
// lib/supabaseAdmin.ts
// Service role client — bypasses RLS. NEVER import from client code.
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin must never run in browser context');
  }
  
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
```

#### `lib/secrets.ts`（從 Vault 取 key）

```typescript
// lib/secrets.ts
// Fetches encryption + hash keys from Supabase Vault.
// Caches in memory for short period to avoid repeated Vault calls.
import { createSupabaseAdminClient } from './supabaseAdmin';

let _cache: { encryptionKey: string; hashKey: string; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getSecretsFromVault(): Promise<{ encryptionKey: string; hashKey: string }> {
  if (_cache && Date.now() < _cache.expiresAt) {
    return { encryptionKey: _cache.encryptionKey, hashKey: _cache.hashKey };
  }
  
  const admin = createSupabaseAdminClient();
  
  // Vault accessor — actual SQL depends on how secrets are stored.
  // Adjust based on your Vault setup at Phase A pre-flight time.
  const { data, error } = await admin
    .from('vault.decrypted_secrets')
    .select('name, decrypted_secret')
    .in('name', ['app_encryption_key', 'app_hash_key']);
  
  if (error || !data) {
    throw new Error(`Failed to fetch secrets from Vault: ${error?.message}`);
  }
  
  const encryptionKey = data.find(d => d.name === 'app_encryption_key')?.decrypted_secret;
  const hashKey = data.find(d => d.name === 'app_hash_key')?.decrypted_secret;
  
  if (!encryptionKey || !hashKey) {
    throw new Error('Required vault secrets not found');
  }
  
  _cache = {
    encryptionKey,
    hashKey,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  
  return { encryptionKey, hashKey };
}

// 用於 key rotation 完成後手動 invalidate cache
export function clearSecretsCache() {
  _cache = null;
}
```

**驗證點**：
- [ ] 三個 client 檔案編譯通過
- [ ] `createSupabaseBrowserClient()` 在 client component 可用
- [ ] `createSupabaseServerClientWithCrypto()` 在 server action 跑成功（不報錯）
- [ ] 從 `lib/supabaseAdmin.ts` import 到 client 端會在 build time 報錯

### 1.2 新建 `lib/operationalEvents.ts`

```typescript
// lib/operationalEvents.ts
// Records anonymized behavioral events for research/analytics.
// Per design principle 8: every UI is an observation instrument.
// Reference: docs/data-dictionary.md for canonical event_type list
import { createSupabaseAdminClient } from './supabaseAdmin';
import { createHmac } from 'crypto';

export interface OperationalEvent {
  tenantId: string;
  userId: string;
  userRole: 'teacher' | 'parent' | 'admin' | 'director' | 'platform_admin' | 'pending';
  eventType: string;             // see data-dictionary.md
  payload?: Record<string, unknown>;  // structured, no PII
  priorEventType?: string;
  timeSincePriorMs?: number;
  sessionId?: string;
  classAnonCode?: string;
  ageBand?: '6-7' | '8-9' | '10-11' | '12-13' | 'teen';
}

/**
 * Records an operational event. Fire-and-forget — failures do NOT block main flow.
 * 
 * @example
 *   await recordEvent({
 *     tenantId, userId, userRole: 'teacher',
 *     eventType: 'submit_observation',
 *     payload: { mood: 4, focus: 3, time_to_complete_seconds: 45 }
 *   });
 */
export async function recordEvent(event: OperationalEvent): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const anonId = hmacUserId(event.userId);
    
    // Defensive PII check — refuse to write if payload contains obvious PII fields
    if (event.payload && containsLikelyPii(event.payload)) {
      console.error('[recordEvent] BLOCKED: payload contains likely PII', {
        eventType: event.eventType,
        suspiciousKeys: findSuspiciousKeys(event.payload),
      });
      return;  // Fire-and-forget — don't throw
    }
    
    await admin.from('operational_events').insert({
      tenant_id: event.tenantId,
      event_type: event.eventType,
      event_payload: event.payload ?? {},
      user_role: event.userRole,
      user_anon_id: anonId,
      prior_event_type: event.priorEventType,
      time_since_prior_ms: event.timeSincePriorMs,
      session_id: event.sessionId,
      class_anon_code: event.classAnonCode,
      age_band: event.ageBand,
    });
  } catch (err) {
    // Fire-and-forget: log but don't throw
    console.error('[recordEvent] write failed:', err);
  }
}

function hmacUserId(userId: string): string {
  const secret = process.env.OPS_EVENT_HMAC_SECRET;
  if (!secret) {
    throw new Error('OPS_EVENT_HMAC_SECRET not configured');
  }
  return createHmac('sha256', secret).update(userId).digest('hex');
}

export function hmacClassCode(className: string): string {
  const secret = process.env.OPS_EVENT_HMAC_SECRET!;
  return createHmac('sha256', secret).update(className).digest('hex').slice(0, 16);
}

export function ageBandOf(birthday: Date | string): OperationalEvent['ageBand'] {
  const bday = typeof birthday === 'string' ? new Date(birthday) : birthday;
  const ageMs = Date.now() - bday.getTime();
  const ageYears = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
  if (ageYears < 8) return '6-7';
  if (ageYears < 10) return '8-9';
  if (ageYears < 12) return '10-11';
  if (ageYears < 14) return '12-13';
  return 'teen';
}

// PII defensive check
const SUSPICIOUS_KEYS = [
  'name', 'chinese_name', 'english_name',
  'email', 'phone', 'mobile',
  'address', 'birthday', 'id_card',
  'student_id', 'parent_id', 'user_id',
];

function containsLikelyPii(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some(k => 
    SUSPICIOUS_KEYS.some(s => k.toLowerCase().includes(s))
  );
}

function findSuspiciousKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).filter(k =>
    SUSPICIOUS_KEYS.some(s => k.toLowerCase().includes(s))
  );
}
```

**驗證點**：
- [ ] 寫一筆 test event，DB `operational_events` 有出現
- [ ] 故意傳 `{ student_name: '王小明' }` payload，console.error 應顯示「BLOCKED: payload contains likely PII」且不寫入 DB
- [ ] `hmacUserId` 同一 user_id 永遠回相同 hash

### 1.3 新建 `lib/accessLog.ts`

```typescript
// lib/accessLog.ts
// Records PII access events for compliance audit.
// Per PII protection plan layer 6.
import { createSupabaseAdminClient } from './supabaseAdmin';

export interface AccessLogEntry {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  actorIp?: string;
  resourceType: 'student' | 'parent' | 'contact_book' | 'exam_result' | 'payment' | 'leave_request' | 'user' | 'attendance';
  resourceId?: string;
  action: 'read' | 'list' | 'export' | 'modify' | 'delete';
  queryParams?: Record<string, unknown>;
}

/**
 * Records an access to PII data. Fire-and-forget.
 * 
 * MUST be called whenever PII is read/exported.
 */
export async function logAccess(entry: AccessLogEntry): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    
    await admin.from('access_log').insert({
      tenant_id: entry.tenantId,
      actor_user_id: entry.actorUserId,
      actor_role: entry.actorRole,
      // actor_ip will be encrypted via RPC; raw value here will be encrypted on insert
      actor_ip: entry.actorIp,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      action: entry.action,
      query_params: entry.queryParams,
    });
  } catch (err) {
    // Fire-and-forget but alert
    console.error('[logAccess] CRITICAL: failed to write access log', err);
    // Production: send to monitoring (Sentry/etc)
  }
}

/**
 * Wrap a sensitive read with automatic access logging.
 * 
 * @example
 *   const student = await withAccessLog(
 *     { tenantId, actorUserId, actorRole, resourceType: 'student', resourceId: id, action: 'read' },
 *     () => supabase.rpc('get_student_decrypted', { p_id: id })
 *   );
 */
export async function withAccessLog<T>(
  entry: AccessLogEntry,
  fn: () => Promise<T>
): Promise<T> {
  const result = await fn();
  // Don't await — fire and forget
  logAccess(entry).catch(err => console.error('[withAccessLog] log failed', err));
  return result;
}
```

**驗證點**：
- [ ] 跑 `logAccess(...)` 後 `access_log` 表多一筆
- [ ] `withAccessLog` 不會 block 主 query 速度

### 1.4 改 `lib/permissions.ts`（保留，但簡化）

**現況**：14 個權限 key + 三層計算（DB role_configs + extra_permissions + HARDCODED_DEFAULTS）

**改成**：保留 UI 級權限 gating（控制按鈕顯示/隱藏），但**資料層的隔離靠 RLS**，不再依賴這支 file。

```typescript
// lib/permissions.ts（精簡化）
// Used ONLY for UI gating (which buttons to show, which menus to render).
// Data-level access is enforced by RLS — DO NOT rely on this for security.

export interface PermissionMap {
  manageAnnouncements: boolean;
  viewAllStudents: boolean;
  editStudents: boolean;
  approveLeave: boolean;
  viewGrades: boolean;
  editGrades: boolean;
  fillContactBook: boolean;
  viewPickupQueue: boolean;
  viewManagerDashboard: boolean;
  manageUsers: boolean;
  chatWithParents: boolean;
  viewAttendance: boolean;
  viewProgress: boolean;
  viewPayments: boolean;
}

// 沿用既有的 HARDCODED_DEFAULTS / getEffectivePermissions 邏輯
// 但加註：這些是 UI 控制，DB 層用 RLS

export function getEffectivePermissions(
  role: string,
  roleConfig?: Partial<PermissionMap>,
  extraPermissions?: Partial<Record<keyof PermissionMap, boolean | null>>
): PermissionMap {
  // ... 沿用既有實作
}
```

⚠️ **重要**：本檔案的權限 check **不能取代 RLS**。即使 `permissions.viewAllStudents = false`，使用者打開 DevTools 直接呼叫 Supabase API 仍會被 RLS 擋（因為 JWT 內 tenant_id + role 已限制）。permissions 只是「為什麼按鈕長那樣」的 UI 邏輯。

### 1.5 新建 `lib/usePIIData.ts`（client-side hook 取 decrypted PII）

```typescript
// lib/usePIIData.ts
// Hook for fetching decrypted PII data from server.
// Client components NEVER decrypt directly — always via server-side endpoint.
import { useEffect, useState } from 'react';

export function useStudentDetail(studentId: string | null) {
  const [data, setData] = useState<DecryptedStudent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    
    // Hit server endpoint that does RPC + access_log
    fetch(`/api/students/${studentId}`)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((data: DecryptedStudent) => setData(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  return { data, loading, error };
}

export interface DecryptedStudent {
  id: string;
  chineseName: string;
  englishName?: string;
  grade?: string;
  // ... etc — does NOT include _encrypted variants
}
```

**驗證點**：
- [ ] Client component 用此 hook 取得學生 detail 顯示中文姓名正常
- [ ] DevTools Network panel 看到呼叫的是 `/api/students/[id]` 而非 Supabase URL
- [ ] Server 端有寫一筆 `access_log`

---

## 2. 階段 2：app/ Auth 頁面（4 頁，約 1 天）

### 2.1 `app/page.tsx` 首頁

**改造重點**：

1. 改用 `createSupabaseServerClient()`（不是直接 import singleton）
2. 加 `recordEvent({ eventType: 'open_home_page' })`
3. 確認 onboarding 完成後跳轉邏輯仍正確

**驗證**：登入後首頁 13 個 module 卡片正確顯示 + operational_events 出現一筆 `open_home_page`

### 2.2 `app/login/page.tsx`

**改造重點**：

1. `recordEvent({ eventType: 'open_login_page' })` on mount
2. 登入成功後 `recordEvent({ eventType: 'submit_login', payload: { success: true } })`
3. 登入失敗 `recordEvent({ ..., payload: { success: false } })` — 但**不**記 email
4. 跳轉到 `/` 前確認 user.is_approved（從 JWT 取）

### 2.3 `app/register/page.tsx`

**改造重點**：

1. 註冊送出前 client-side validation
2. 註冊成功後 server-side trigger 在 `public.users` 表 INSERT 一筆（並寫 `tenant_id`）
3. `recordEvent({ eventType: 'submit_register', payload: { role_chosen, has_child_binding } })`
4. 跳轉 onboarding

⚠️ **新挑戰**：註冊時還沒 tenant_id（使用者還沒被 admin 核准），所以 users 表 INSERT 暫時用 NULL tenant_id？或預設給 Tom Bear？

**建議方案**：所有「自助註冊」預設 tenant_id = Tom Bear（因為現階段只有自家補習班）。未來開放外部客戶時，註冊頁面需要先透過 URL 識別 tenant（path-based）。

### 2.4 `app/onboarding/page.tsx`、`app/reset-password/page.tsx`

**改造重點**：
- onboarding：完成時 `recordEvent({ eventType: 'complete_onboarding' })`
- reset-password：加 timeout（解 bug audit P3）

---

## 3. 階段 3：app/ 讀為主頁面（5 頁，約 2-3 天）

### 3.1 `app/dashboard/page.tsx`（接送儀表板）

**改造重點**：
- 改用 `createSupabaseServerClient()`
- query `pickup_requests` 改用 RLS（不寫 `.eq('tenant_id', ...)`）
- `recordEvent({ eventType: 'open_dashboard', payload: { pending_count, arrived_count } })`

### 3.2 `app/pickup/page.tsx`（接送中心）

- 同上模式
- `recordEvent({ eventType: 'open_pickup_center', payload: { queue_length } })`
- 廣播按鈕觸發 `recordEvent({ eventType: 'trigger_pickup_announce' })`

### 3.3 `app/announcements/page.tsx`

- 列表 query 改成靠 RLS（公告會自動依 tenant 過濾）
- 加 `recordEvent({ eventType: 'open_announcement_list', payload: { unread_count, total } })`
- 點公告 `recordEvent({ eventType: 'view_announcement', payload: { delay_hours_since_published } })`
- **清測試垃圾資料**（page audit P4）— 透過 admin 介面手動刪 2 筆（"jhkj" / "hihiuhiuh"）— ⚠️ 觸及紅線 3 需 Telly 親自做

### 3.4 `app/my-child/page.tsx`（家長端）

- 家長視角，靠 RLS 自動只顯示自己孩子
- 加 `recordEvent({ eventType: 'parent_open_my_child', payload: { has_linked_child } })`
- 兩個 tab 切換 `recordEvent({ eventType: 'parent_view_child_tab', payload: { tab } })`

### 3.5 `app/admin/logs/page.tsx`（操作日誌）

- 改用 `createSupabaseAdminClient`（service role）— 因為要看 audit_logs 跨範圍
- 但要加**額外 access_log 紀錄**：「誰看了哪天的日誌」也是個資存取
- `recordEvent({ eventType: 'view_audit_log', payload: { date } })`

---

## 4. 階段 4：核心 CRUD — 學生為核心（5 頁，約 3-5 天）

### 4.1 `app/students/page.tsx`（最複雜的一頁，最先改）

這頁 152 學生 + 加密欄位 + RLS + 編輯權限 — 是整個 refactor 的試金石。

**改造清單**：

| Sub-task | 改動 | 風險 |
|----------|------|------|
| 列表 query | `supabase.rpc('list_students_decrypted')` 取代直接 SELECT | 🔴 高 — 影響首頁列表 |
| 篩選班級 | 維持 client-side filter，但用 decrypted name | 🟡 中 |
| 學生 Profile Modal | 用 `useStudentDetail(id)` hook | 🟡 中 |
| 新增學生 | 用 `supabase.rpc('insert_student_with_encryption', {...})` | 🔴 高 — 影響資料寫入 |
| 編輯學生欄位 | 用 `supabase.rpc('update_student_encrypted_field', {...})` | 🔴 高 |
| analytics tab | join `contact_books` 但需處理新 schema | 🟡 中 |

**驗證點**：
- [ ] 152 學生姓名正常顯示中文（不是亂碼）
- [ ] 班別篩選正常
- [ ] 新增一筆假學生，DB 內看到 `chinese_name_encrypted` 是 BYTEA
- [ ] 列表頁 access_log 應該每次打開記錄一筆「list students」
- [ ] 不會出現 console error

⚠️ **這頁建議花 2 天，先在 staging 跑透**才動 production。

### 4.2 `app/contact-book/page.tsx`（聯絡簿）

- **重新 onboard 整個流程**：因為 migration 005 重建了 schema
- 老師選班 → 選日期 → 選學生
- 評分填寫（mood/focus/participation/expression/appetite）
- 上傳照片
- 送出 → `recordEvent({ eventType: 'submit_observation', payload: { time_to_complete_seconds, ... } })`

**最重要的 operational_events**：

```typescript
// 老師點到某學生開始填
recordEvent({ eventType: 'start_fill_observation', payload: { record_date } });

// 每個欄位填寫
recordEvent({ eventType: 'fill_mood_score', payload: { score: 4 } });
// ... 其他評分

// 送出完整
recordEvent({
  eventType: 'submit_observation',
  payload: {
    time_to_complete_seconds: elapsedSeconds,
    all_scores_filled: bool,
    has_public_note: bool,
    has_photo: bool,
    public_note_length_chars: note.length,
  },
});
```

⚠️ payload 嚴禁含老師寫的「實際文字內容」— 只記長度。

### 4.3 `app/grades/page.tsx`（成績管理）

- 改用新 RPC 寫入（exam_results 仍是表，但 student_name 加密）
- 修 manager 戰情室成績顯示 0 的 bug（P1）— 確認 query 從 `exam_results` 取（不是已 dropped 的 grades）
- 加事件：`submit_grade_batch`、`view_grade_analysis` 等

### 4.4 `app/attendance/page.tsx`、`app/progress/page.tsx`

- 標準改造：RLS 自動過濾、加 operational_events
- attendance 完成時加 `complete_class_attendance` event 含「點名耗時」（很有價值的研究素材）

---

## 5. 階段 5：其他 CRUD（5 頁，約 5-7 天）

### 5.1 `app/leave/page.tsx`（請假中心）

- 96 筆真實資料 — 改造時不要破壞
- 加事件：`submit_leave_request`、`approve_leave`、`reject_leave`
- 量「核准延遲時間」（approval_delay_hours）— 有價值的營運指標

### 5.2 `app/chat/page.tsx`（親師對話）

- 訊息內容**不加密**（這是即時溝通，加密會影響效能），但 RLS 嚴格限制
- 加事件：`open_chat_thread`、`send_message`（payload 不放原文，只放 length）

### 5.3 `app/payment/page.tsx`（繳費紀錄）

- 真實繳費資料 — RLS 強制
- 加事件：`add_payment_record`（payload 用 amount_band 不存原始金額）

### 5.4 `app/schedule/page.tsx`、`app/staff/page.tsx`

- schedule：標準改造
- **staff**：⚠️ 處理 P2 問題 — 與 `/admin` 重複 + 班級名稱不一致
  - **建議方案**：直接 deprecate `/staff`，所有 link 改指 `/admin`，但保留 source code 一段時間以防回退

---

## 6. 階段 6：管理層頁面 + 修 bug（3-4 天）

### 6.1 `app/admin/page.tsx`

- 13 員工帳號管理
- 加事件：`approve_user`、`update_user_role` 等
- 確認跨 tenant 看不到（platform_admin 可看，但記 access_log）

### 6.2 `app/manager/page.tsx`（部門戰情室）

- **修 P1 bug**：成績統計改讀 `exam_results`
- 多個 tab 切換 → 每個 tab 記 `recordEvent`
- 篩選條件變動 → 不記每次 click（避免 event 爆量），但記 final 結果（debounce 1 秒）

### 6.3 修剩餘 bug

從 [`week0-page-audit.md`](./week0-page-audit.md) §2 帶來的清單：

- [ ] P1 manager 戰情室數據（4.4 修）
- [ ] P2 /staff 重複（5.4 處理）
- [ ] P3 /reset-password timeout（2.4 修）
- [ ] P4 測試垃圾公告（3.3 在 admin 介面手動清，紅線 3 — 需 Telly 親自）

---

## 7. 階段 7：整體 e2e 驗證（1-2 天）

### 7.1 必跑的 e2e 測試

- [ ] Tenant 隔離測試：fake tenant 看不到 Tom Bear 資料
- [ ] 加密 round-trip：所有加密欄位寫入後解密正常
- [ ] access_log：模擬 5 種典型 PII 存取，全部進 access_log
- [ ] operational_events：模擬完整一日工作流程，事件序列正確
- [ ] platform_admin 特權：Telly 帳號跨 tenant 可看，**但 access_log 也記**
- [ ] 一般 teacher：只看自己班學生
- [ ] 一般 parent：只看自己孩子

### 7.2 性能驗證

- [ ] 列表頁載入 < 2 秒（即使解密 100 學生）
- [ ] 加密欄位搜尋 < 500ms（用 hash index）
- [ ] operational_events 寫入不阻塞主流程

### 7.3 邊界 case 驗證

- [ ] 使用者剛註冊還沒被核准（is_approved=false）→ 看到「待審核」頁
- [ ] 加密 key 沒設好 → 後端報錯，但前端 graceful fallback（顯示「資料載入失敗，請重新登入」）
- [ ] Vault 連線失敗 → 後端 5 秒 timeout 後 fallback

---

## 8. 各 page 改造時程估計（Telly 視角，1 人）

| Page | 預估時數 | 風險級別 | 建議排序 |
|------|---------|---------|---------|
| lib/ 整套 | 8 小時 | 🔴 高 | 第 1 週 D1-D2 |
| /、/login、/register、/onboarding、/reset-password | 4 小時 | 🟢 低 | 第 1 週 D3 |
| /dashboard、/pickup、/announcements、/my-child、/admin/logs | 6 小時 | 🟢 低-中 | 第 1 週 D4-D5 |
| /students | 8 小時 | 🔴 高 | 第 2 週 D1-D2 |
| /contact-book | 5 小時 | 🟡 中 | 第 2 週 D3 |
| /grades + 修 manager P1 | 4 小時 | 🟡 中 | 第 2 週 D4 |
| /attendance、/progress | 4 小時 | 🟢 低 | 第 2 週 D5 |
| /leave、/chat、/payment | 5 小時 | 🟡 中 | 第 3 週 D1-D2 |
| /schedule、/staff（deprecate）| 3 小時 | 🟢 低 | 第 3 週 D3 |
| /admin、/manager | 4 小時 | 🟡 中 | 第 3 週 D4 |
| e2e 驗證 + 邊界 case 修 | 4 小時 | 🔴 高 | 第 3 週 D5 |
| **總計** | **約 55 小時** | — | 約 3 週 |

**Telly 工作節奏**：每天 2.5 小時 × 22 工作天 = 55 小時。對齊 v3.0 §5.5 Phase B 第 4-5 週的時間預算。

---

## 9. 共通 patterns 速查

### 9.1 加 operational_events 的標準位置

```typescript
'use client';
import { useEffect } from 'react';
import { recordEvent } from '@/lib/operationalEvents';
import { useSession } from '@/lib/useSession';

export default function SomePage() {
  const session = useSession();

  // 頁面開啟事件
  useEffect(() => {
    if (!session) return;
    recordEvent({
      tenantId: session.tenantId,
      userId: session.userId,
      userRole: session.role,
      eventType: 'open_some_page',
    });
  }, [session]);

  // 動作觸發事件
  const handleSubmit = async (data: FormData) => {
    const t0 = Date.now();
    
    const { error } = await supabase.from('foo').insert({ ... });
    
    recordEvent({
      tenantId: session.tenantId,
      userId: session.userId,
      userRole: session.role,
      eventType: 'submit_foo',
      payload: {
        time_to_complete_seconds: Math.round((Date.now() - t0) / 1000),
        success: !error,
      },
    });
  };
}
```

### 9.2 access_log 必加位置

任何讀取 PII 欄位的 server-side endpoint：

```typescript
// app/api/students/[id]/route.ts
import { withAccessLog } from '@/lib/accessLog';
import { createSupabaseServerClientWithCrypto } from '@/lib/supabaseServer';
import { getSessionContext } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSessionContext(req);
  if (!session) return new Response('Unauthorized', { status: 401 });
  
  const supabase = await createSupabaseServerClientWithCrypto();
  
  const student = await withAccessLog(
    {
      tenantId: session.tenantId,
      actorUserId: session.userId,
      actorRole: session.role,
      actorIp: req.headers.get('x-forwarded-for') ?? undefined,
      resourceType: 'student',
      resourceId: params.id,
      action: 'read',
    },
    async () => {
      const { data, error } = await supabase
        .rpc('get_student_decrypted', { p_student_id: params.id });
      if (error) throw error;
      return data?.[0];
    }
  );
  
  if (!student) return new Response('Not found', { status: 404 });
  return Response.json(student);
}
```

### 9.3 改既有 INSERT 加 tenant_id

```typescript
// 改前
const { data, error } = await supabase
  .from('announcements')
  .insert({ title: 'XX', content: 'YY' });

// 改後
const { data, error } = await supabase
  .from('announcements')
  .insert({
    title: 'XX',
    content: 'YY',
    tenant_id: session.tenantId,   // ← 加這行
    author_id: session.userId,
  });
```

### 9.4 改既有 SELECT 移除 application-level tenant filter

```typescript
// 改前（多餘的）
const { data } = await supabase
  .from('students')
  .select('*')
  .eq('tenant_id', currentTenantId);

// 改後（RLS 自動處理）
const { data } = await supabase
  .from('students')
  .select('id, grade, school_grade');  // 不再 SELECT *
```

⚠️ 不要直接 `SELECT *` — 因為 `*` 會回 `chinese_name_encrypted` 等 BYTEA 欄位，client 看不懂。明確列要的欄位。

---

## 10. 改造 checklist（每改一頁勾一次）

每改完一頁，跑這份 mini-checklist：

- [ ] 換成 `createSupabaseServerClient()` 或 `createSupabaseBrowserClient()`（不再 import singleton）
- [ ] 移除應用層 `.eq('tenant_id', ...)`
- [ ] INSERT 加 `tenant_id`
- [ ] SELECT 加密欄位走 RPC（不直接 SELECT `_encrypted` 欄位）
- [ ] 加 `recordEvent({ eventType: 'open_*' })` on mount
- [ ] 主要動作（submit/click）加對應 `recordEvent`
- [ ] 讀取 PII 加 `logAccess` 或 `withAccessLog`
- [ ] 確認 console 沒新增 `console.log` PII 內容
- [ ] 確認 API response 沒回傳 BYTEA 欄位給 client
- [ ] 自己測 1 個 happy path + 1 個 error path

---

## 11. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |

---

**文件結束**

> 改 21 個 page 看似很多，但前面打的所有基礎（migrations + lib/）一旦穩了，剩下的就是「對著清單機械執行」。慢慢來，一頁一頁、驗證一次再下一頁。
