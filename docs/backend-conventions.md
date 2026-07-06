# Backend Conventions — Multi-tenant 程式碼規範

> **撰寫日期**：2026-05-08（Telly 出差大陸期間，Claude 撰寫）
> **狀態**：草稿，待 Telly 回國 review
> **適用範圍**：Phase A migrations（001-010）套用之後的所有 `app/` 與 `lib/` 程式碼
> **生效時機**：Telly 回國 + Supabase Pro 升級 + migrations 套用完之後
> **受眾**：Telly、所有 AI 工具（Claude / Cowork / Claude Code / Claude in Chrome）、未來合作夥伴
> **規範來源**：[`../Tom_Bear_AI化優化報告_v3.0.md`](../Tom_Bear_AI化優化報告_v3.0.md) 第 9、10、13 章、[`week0-tech-decisions.md`](./week0-tech-decisions.md)

---

## 0. 為什麼需要這份文件

Phase A migrations 把資料庫架構升級成 multi-tenant + RLS + 個資加密。如果應用層程式碼還用「舊式單租戶 + 明文 + 自己 filter」的寫法，會發生：

1. **看不到資料**：query 沒帶正確 JWT，RLS 把所有 row 都擋掉 → 老師打開 page 看到「沒有資料」（其實是被擋）
2. **資料寫入失敗**：INSERT 沒帶 `tenant_id`，RLS WITH CHECK 拒絕 → 表單按送出沒反應
3. **個資看到亂碼**：直接 SELECT 加密欄位 → UI 顯示亂碼 BYTEA
4. **個資外洩風險**：未在 access_log 寫紀錄就讀學生資料 → 個資合規違規

本文件規範**對的寫法**，避免上述四類錯誤。

---

## 1. 三條紅線提醒（與 v3.0 §13.2 一致）

任何 AI 工具寫 code 時，碰到下列三類動作**必須先取得 Telly 確認**：

1. 💰 **會產生費用**：接需付費 API、升級方案、買網域
2. 💥 **會導致系統癱瘓**：對 production schema 跑 destructive 操作、刪檔
3. 🔓 **會洩漏個資**：把學生姓名/家長電話寫進 log、文件、commit message、test snapshot

不觸及紅線 → 可自主寫 code，做完透明回報。

---

## 2. Supabase Client 三層架構

Phase A 之後 `lib/supabaseClient.ts` 會擴展成三種 client：

### 2.1 Browser Client（anon key + 使用者 JWT + RLS 保護）

```typescript
// lib/supabaseClient.ts
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- ✅ **誰用**：所有 React component、client-side hook
- ✅ **權限**：受 RLS 完整保護，看不到別 tenant 的資料
- ✅ **JWT**：登入後 Supabase 自動帶上 access token（含 `tenant_id` claim by Auth Hook）
- ❌ **不用於**：寫 admin 後台批次操作、發訊息給其他 tenant、跑 cron job

### 2.2 Server Client（anon key + 使用者 JWT，server-side rendering）

```typescript
// lib/supabaseServer.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set({ name: n, value: v, ...o }),
        remove: (n, o) => cookieStore.set({ name: n, value: '', ...o }),
      },
    }
  );
}
```

- ✅ **誰用**：Next.js Server Components、Route Handlers、Server Actions
- ✅ **權限**：跟 browser client 同等，受 RLS 保護
- ❌ **不用於**：跨 tenant 批次操作、cron job

### 2.3 Service Role Client（service_role key — 跳過 RLS！）

```typescript
// lib/supabaseAdmin.ts (server-only, NEVER imported by client code)
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('Service role client must never run in browser context');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // ⚠️ 絕不放前端 env
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

- ✅ **誰用**：定時任務（cron）、Webhook、跨 tenant 平台分析、admin 批次操作
- ⚠️ **權限**：**跳過所有 RLS**，能存取任何 tenant 的資料
- ☠️ **絕不**：在任何 `app/` 下的 client component 或 client hook 使用
- ☠️ **絕不**：把 `SUPABASE_SERVICE_ROLE_KEY` 加上 `NEXT_PUBLIC_` 前綴

**用 service_role 時必須手動帶 tenant_id**：

```typescript
const admin = createSupabaseAdminClient();
// ❌ 錯：不帶 tenant_id，會撈到全部 tenant 的學生
const { data } = await admin.from('students').select('*');

// ✅ 對：明確指定 tenant_id
const { data } = await admin
  .from('students')
  .select('*')
  .eq('tenant_id', targetTenantId);
```

---

## 3. Session Variable 設定（PII 加密 key）

加密欄位的讀寫需要 `app.encryption_key` 與 `app.hash_key` 兩個 session variable。

### 3.1 Server-side：每個 request 開頭 SET

```typescript
// lib/supabaseServer.ts (extended)
import { getEncryptionKeyFromVault } from './secrets';

export async function createSupabaseServerClientWithCrypto() {
  const supabase = createSupabaseServerClient();
  const { encryptionKey, hashKey } = await getEncryptionKeyFromVault();
  
  // SET on every connection — key 不會跨 request 持續
  await supabase.rpc('set_session_keys', {
    p_encryption_key: encryptionKey,
    p_hash_key: hashKey,
  });
  
  return supabase;
}
```

需要在 DB 建一個 RPC function 接收 keys 並設 session variable（Phase A migration 008 之後補）：

```sql
CREATE OR REPLACE FUNCTION public.set_session_keys(
  p_encryption_key TEXT,
  p_hash_key TEXT
)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.encryption_key', p_encryption_key, true); -- true = local to transaction
  PERFORM set_config('app.hash_key', p_hash_key, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2 Browser-side：永遠不要碰 keys

```typescript
// ❌ 絕對禁止
const key = process.env.NEXT_PUBLIC_ENCRYPTION_KEY; // <<< NEVER

// ✅ 唯一正確：透過 server-side API 中介
//   browser 拿不到加密 key，所有解密都發生在 server-side
const res = await fetch('/api/students/' + id);
const decrypted = await res.json(); // server 已解完
```

---

## 4. 讀取資料的標準模式

### 4.1 一般欄位（非加密）

```typescript
// app/students/page.tsx
const supabase = createSupabaseServerClient();
const { data: students } = await supabase
  .from('students')
  .select('id, grade, school_grade, join_date');
// 不需要 .eq('tenant_id', X) — RLS 已自動加 tenant filter
```

### 4.2 加密欄位（必須解密）

```typescript
const supabase = await createSupabaseServerClientWithCrypto(); // 已 SET key
const { data: students } = await supabase
  .from('students')
  .select(`
    id,
    grade,
    chinese_name:chinese_name_encrypted,
    english_name:english_name_encrypted,
    primary_contact_phone:primary_contact_phone_encrypted
  `);

// 上面回傳是 BYTEA。需要 server-side 解密：
import { decryptRow } from '@/lib/encryption';
const decrypted = students?.map(s => decryptRow(s, [
  'chinese_name', 'english_name', 'primary_contact_phone'
]));
```

或更乾淨的做法 — 用 RPC function 直接回傳明文：

```sql
CREATE OR REPLACE FUNCTION public.get_students_decrypted()
RETURNS TABLE (
  id UUID, 
  chinese_name TEXT,
  english_name TEXT,
  primary_contact_phone TEXT,
  grade TEXT
)
SECURITY DEFINER -- 用 function owner 權限，session key 已設好
AS $$
  SELECT 
    s.id,
    decrypt_pii(s.chinese_name_encrypted),
    decrypt_pii(s.english_name_encrypted),
    decrypt_pii(s.primary_contact_phone_encrypted),
    s.grade
  FROM students s
  -- RLS 仍會自動加 tenant filter
$$ LANGUAGE SQL;
```

呼叫：
```typescript
const { data } = await supabase.rpc('get_students_decrypted');
// data 直接是明文
```

### 4.3 搜尋加密欄位

```typescript
// 老師後台輸入「王小明」搜尋
const searchTerm = '王小明';

// 用 RPC function 算 hash + 搜尋（hash 在 server 算，不漏 key）
const { data } = await supabase.rpc('search_student_by_chinese_name', {
  search_input: searchTerm
});
```

對應 RPC：
```sql
CREATE OR REPLACE FUNCTION public.search_student_by_chinese_name(search_input TEXT)
RETURNS TABLE (id UUID, chinese_name TEXT)
SECURITY DEFINER
AS $$
  SELECT s.id, decrypt_pii(s.chinese_name_encrypted)
  FROM students s
  WHERE s.chinese_name_search_hash = hash_for_search(search_input)
$$ LANGUAGE SQL;
```

⚠️ **僅支援精確比對**。模糊搜尋（"王*"）目前不支援 — Phase A 之後若需要再加 LIKE 索引 + Bloom filter。

### 4.4 必須記 access_log

任何讀取 PII 資料的動作，**必須**在 server-side 同時寫一筆 access_log：

```typescript
// lib/accessLog.ts
export async function logAccess(params: {
  tenantId: string;
  actorUserId: string;
  actorRole: string;
  actorIp: string;
  resourceType: 'student' | 'parent' | 'contact_book' | ...;
  resourceId?: string;
  action: 'read' | 'list' | 'export' | 'modify' | 'delete';
  queryParams?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from('access_log').insert({
    tenant_id: params.tenantId,
    actor_user_id: params.actorUserId,
    actor_role: params.actorRole,
    actor_ip_encrypted: encryptPii(params.actorIp),
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    action: params.action,
    query_params: params.queryParams,
  });
}
```

**使用範例**：

```typescript
// app/students/[id]/page.tsx
const student = await supabase.rpc('get_student_decrypted', { p_id: id });
await logAccess({
  tenantId: session.tenantId,
  actorUserId: session.userId,
  actorRole: session.role,
  actorIp: getClientIp(request),
  resourceType: 'student',
  resourceId: id,
  action: 'read',
});
```

⚠️ access_log 寫入失敗**不應 block** 主要查詢（用 `Promise.allSettled` 或 background 寫入），但要記 console.error 通知監控系統。

---

## 5. 寫入資料的標準模式

### 5.1 一般 INSERT（必須帶 tenant_id）

```typescript
const supabase = createSupabaseServerClient();
const session = await getSession(); // 含 tenantId

// ✅ 對：明確帶 tenant_id
const { data, error } = await supabase
  .from('announcements')
  .insert({
    tenant_id: session.tenantId,  // <-- 必須
    title: '本週公告',
    content: '...',
    author_id: session.userId,
  });
```

```typescript
// ❌ 錯：沒帶 tenant_id
const { data, error } = await supabase
  .from('announcements')
  .insert({
    title: '本週公告',
    content: '...',
  });
// → RLS WITH CHECK 拒絕，error.code = '42501' (insufficient_privilege)
```

### 5.2 寫入加密欄位

```typescript
// app/students/new/page.tsx (server action)
'use server';

export async function createStudent(formData: FormData) {
  const supabase = await createSupabaseServerClientWithCrypto();
  const session = await getSession();
  
  const chineseName = formData.get('chineseName') as string;
  const phone = formData.get('primaryPhone') as string;
  
  // 透過 RPC function 加密 + 寫入（在 DB 內完成，明文不離開 server）
  const { data, error } = await supabase.rpc('insert_student_with_encryption', {
    p_chinese_name: chineseName,
    p_english_name: formData.get('englishName'),
    p_primary_contact_phone: phone,
    // ... 其他欄位
  });
  
  // RPC 內部會自動 SET tenant_id, 自動加密, 自動計算 search_hash
}
```

對應 RPC（migration 008 之後手寫）：
```sql
CREATE OR REPLACE FUNCTION public.insert_student_with_encryption(
  p_chinese_name TEXT,
  p_english_name TEXT,
  p_primary_contact_phone TEXT
  -- ... 其他參數
)
RETURNS UUID
SECURITY DEFINER
AS $$
DECLARE
  new_id UUID;
  current_tenant UUID := current_tenant_id();
BEGIN
  INSERT INTO students (
    tenant_id,
    chinese_name_encrypted,
    chinese_name_search_hash,
    english_name_encrypted,
    primary_contact_phone_encrypted,
    primary_contact_phone_search_hash
  ) VALUES (
    current_tenant,
    encrypt_pii(p_chinese_name),
    hash_for_search(p_chinese_name),
    encrypt_pii(p_english_name),
    encrypt_pii(p_primary_contact_phone),
    hash_for_search(p_primary_contact_phone)
  )
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;
```

### 5.3 UPDATE

```typescript
// ✅ 對：RLS 會自動加 tenant filter，且 WITH CHECK 防止改成別 tenant
const { error } = await supabase
  .from('students')
  .update({ grade: 'CEI-B' })
  .eq('id', studentId);
// 不需要 .eq('tenant_id', X) — RLS 處理
```

### 5.4 DELETE

```typescript
// 刪除前必須先 access_log
await logAccess({
  tenantId: session.tenantId,
  actorUserId: session.userId,
  actorRole: session.role,
  actorIp: getClientIp(),
  resourceType: 'student',
  resourceId: studentId,
  action: 'delete',
});

const { error } = await supabase
  .from('students')
  .delete()
  .eq('id', studentId);
```

---

## 6. operational_events 寫入 — 設計原則第 8 條

> 詳見 v3.0 §2 原則 8：每個 UI 都是觀察儀器
> 配套：`docs/data-dictionary.md`（Phase A 第 1 週建立）

### 6.1 何時寫

**每個有意義的使用者動作都要寫一筆**：

- 打開特定 page（`open_*`）
- 完成表單送出（`submit_*` / `fill_*`）
- 點按特定功能（`trigger_*`）
- 查看特定資料（`view_*`）
- 完成某流程（`complete_*`）

### 6.2 寫入範本

```typescript
// lib/operationalEvents.ts
import { createHash } from 'crypto';

export async function recordEvent(params: {
  tenantId: string;
  userId: string;
  userRole: string;
  eventType: string;
  payload?: Record<string, unknown>; // ⚠️ 嚴禁含 PII
  priorEventType?: string;
  timeSincePriorMs?: number;
  sessionId?: string;
  classAnonCode?: string;
  ageBand?: string;
}) {
  const admin = createSupabaseAdminClient();
  
  // user_anon_id = HMAC(user_id, secret) — 不可逆
  const anonId = hmacUserId(params.userId);
  
  await admin.from('operational_events').insert({
    tenant_id: params.tenantId,
    event_type: params.eventType,
    event_payload: params.payload ?? {},
    user_role: params.userRole,
    user_anon_id: anonId,
    prior_event_type: params.priorEventType,
    time_since_prior_ms: params.timeSincePriorMs,
    session_id: params.sessionId,
    class_anon_code: params.classAnonCode,
    age_band: params.ageBand,
  });
}

function hmacUserId(userId: string): string {
  const secret = process.env.OPS_EVENT_HMAC_SECRET!; // server-only
  return createHash('sha256').update(userId + secret).digest('hex');
}
```

### 6.3 ❌ 嚴禁

```typescript
// ❌ 絕不放任何 PII 到 event_payload
await recordEvent({
  tenantId,
  userId,
  userRole: 'teacher',
  eventType: 'fill_observation',
  payload: {
    student_name: '王小明',          // ☠️ PII
    parent_phone: '0912345678',      // ☠️ PII
    teacher_email: 'a@b.com',        // ☠️ PII
  },
});
```

```typescript
// ✅ 對：用匿名 ID 與結構化評分
await recordEvent({
  tenantId,
  userId,
  userRole: 'teacher',
  eventType: 'fill_observation',
  payload: {
    mood: 4,
    focus: 3,
    homework_completed: true,
    time_to_complete_seconds: 45,
    public_note_length: 120, // 長度而非內容
  },
  classAnonCode: hmacClassName(student.classGroup),
  ageBand: ageBandOf(student.birthday),
});
```

### 6.4 寫入失敗策略

operational_events 寫入失敗**絕不能中斷主流程**。用 fire-and-forget：

```typescript
recordEvent({...}).catch(err => {
  console.error('[ops_event_write_failed]', err);
  // 不 throw, 主流程繼續
});
```

---

## 7. 命名規範

### 7.1 資料庫（已有，沿用）

| 類型 | 規範 | 範例 |
|------|------|------|
| 表名 | snake_case 複數 | `students`, `chat_messages` |
| 欄位 | snake_case | `chinese_name`, `created_at` |
| FK | `{table_singular}_id` | `student_id`, `tenant_id` |
| 時間戳 | `_at` 結尾 | `created_at`, `paid_at` |
| 日期 | `_date` 結尾 | `start_date`, `record_date` |
| 布林 | `is_` 前綴 | `is_absent`, `is_approved` |
| 加密欄位 | `_encrypted` 後綴 | `chinese_name_encrypted` |
| 搜尋 hash | `_search_hash` 後綴 | `chinese_name_search_hash` |

### 7.2 TypeScript

| 類型 | 規範 | 範例 |
|------|------|------|
| 變數 / 函式 | camelCase | `studentList`, `getStudent()` |
| Class / Type | PascalCase | `Student`, `ContactBook` |
| Constant | SCREAMING_SNAKE | `MAX_FILE_SIZE` |
| 檔名（react） | kebab-case | `student-list.tsx` |
| 檔名（其他） | camelCase | `supabaseClient.ts`（既有，不改） |

### 7.3 Event types（operational_events）

snake_case 動詞 + 名詞，避免縮寫：

- ✅ `open_dashboard`, `fill_observation`, `view_student_profile`, `send_message`
- ❌ `openDashboard`, `view_sp`, `OPEN_DASHBOARD`

完整字典在 `docs/data-dictionary.md`。

### 7.4 Migration files

`YYYYMMDD_NNN_short_description.sql`

例：`20260511_001_create_tenants_and_seed.sql`

### 7.5 RPC functions

snake_case 動詞 + 名詞 + 可選 suffix：

- `get_students_decrypted()` — 讀
- `insert_student_with_encryption()` — 寫
- `search_student_by_chinese_name()` — 搜尋

---

## 8. 禁止 vs 必做的 Pattern 清單

### ☠️ 嚴禁

| # | 禁止行為 | 理由 |
|---|---------|------|
| 1 | 在 client component 用 service_role key | 個資全外洩 |
| 2 | 把 SUPABASE_SERVICE_ROLE_KEY 加 NEXT_PUBLIC_ 前綴 | 同上 |
| 3 | INSERT/UPDATE 業務表時漏 tenant_id | RLS 拒絕，使用者看到「儲存失敗」 |
| 4 | 把 PII 寫進 operational_events.event_payload | 違反研究合法基礎 |
| 5 | 把 PII 寫進 console.log / 錯誤訊息 / Sentry | 個資外洩 |
| 6 | 在 client-side 直接讀 _encrypted 欄位（不解密） | UI 顯示亂碼 |
| 7 | hardcode 'tombear' 在程式碼 | 違反 multi-tenant 原則 |
| 8 | 用 `eq('tenant_id', ...)` 做安全檢查 | RLS 已處理，多餘且若 RLS 改變會誤用 |
| 9 | 把加密 key / hash key 放 .env（含 NEXT_PUBLIC_ 或不含）| 應在 Supabase Vault |
| 10 | 跳過 access_log 寫入 PII 讀取 | 違反個資合規 |
| 11 | 對 production schema 跑未經 review 的 migration | 違反三紅線之 2 |
| 12 | 直接 commit `.env.local` / `private-research/*` | 已 gitignore，但仍要小心 |

### ✅ 必做

| # | 必做行為 | 理由 |
|---|---------|------|
| 1 | 所有業務表 INSERT 帶 tenant_id | RLS WITH CHECK 強制 |
| 2 | 讀寫加密欄位走 RPC function | 明文不離開 DB |
| 3 | PII 讀取後寫 access_log | 個資合規 |
| 4 | 使用者動作寫 operational_events | 設計原則第 8 條 |
| 5 | event_payload 只放結構化匿名資料 | 研究合法基礎 |
| 6 | 寫 migration 必有 ROLLBACK SCRIPT | 災難復原 |
| 7 | 加密欄位的 INSERT 同時寫 _encrypted + _search_hash | 維持搜尋能力 |
| 8 | RLS 拒絕時 UI 顯示「找不到」（404）而非「沒權限」（403）| 避免洩漏資訊 |
| 9 | 任何錯誤訊息給使用者前，先掃過確認不含 PII | 個資合規 |
| 10 | service_role client 只在 `app/api/*` 或 server actions 用 | 避免外洩 key |

---

## 9. 錯誤處理約定

### 9.1 RLS 拒絕

```typescript
const { data, error } = await supabase.from('students').select('*').eq('id', someId);

// error.code === 'PGRST116' (no rows returned) when:
// - row doesn't exist
// - row exists but RLS hides it (跨 tenant)
// 兩者前端應該都顯示「找不到此學生」，不暴露 RLS 細節
```

### 9.2 加密失敗

```typescript
try {
  const { data } = await supabase.rpc('get_student_decrypted', { p_id: id });
} catch (err) {
  // error message 可能含 "encryption key not set" 或 "decryption failed"
  // ⚠️ 不要把原始 error.message 顯示給使用者
  console.error('[decrypt_failed]', err); // server log 可以
  return { error: '資料載入失敗，請重新登入' }; // 給使用者的訊息
}
```

### 9.3 個資外洩防呆

任何要回傳給 client 的物件，建議用 schema validator（如 Zod）過濾：

```typescript
import { z } from 'zod';

const PublicStudentSchema = z.object({
  id: z.string().uuid(),
  grade: z.string().optional(),
  // 注意：不允許 chinese_name, parent_phone 等原始欄位直接傳遞
  // 解密後若要傳，欄位名要去敏化（如 displayName）
});

// API response 前先 parse
return Response.json(PublicStudentSchema.parse(data));
```

---

## 10. 與 Phase A migration 的對應

| Migration | 影響的 code 規範 |
|-----------|----------------|
| 001 tenants 主表 | 所有業務 INSERT 必須帶 tenant_id（§5.1） |
| 002 ops 表 | 引入 operational_events（§6）、access_log（§4.4） |
| 003-004 dead 表清理 | 移除程式碼裡對 profiles / system_logs / grades / pickups / pick_up_queue / messages 等的引用 |
| 005 contact_books 重建 | 改用新的欄位結構（mood/focus/participation/expression + appetite） |
| 006 phone 合併 | 改用 primary_contact_phone / secondary_contact_phone |
| 007 tenant_id 全表 | 引入 multi-tenant query pattern（§5.1） |
| 008 加密 | 引入 RPC 解密 pattern（§4.2）+ session key 設定（§3） |
| 009 search hash | 引入 hash 搜尋 pattern（§4.3） |
| 010 RLS | 移除應用層 `.eq('tenant_id', ...)`（§5.3） |

---

## 11. Phase A 之後的程式碼演進路線

### 11.1 階段 1：migrations 套用後（你回國第一週）

- 改 `lib/supabaseClient.ts` 支援三種 client（§2）
- 寫 `lib/encryption.ts` decrypt helper（§4.2）
- 寫 `lib/operationalEvents.ts`（§6）
- 寫 `lib/accessLog.ts`（§4.4）
- 對既有 21 個 page，**逐頁**改：
  1. INSERT 加 tenant_id
  2. SELECT 加密欄位改走 RPC
  3. 移除 application-level tenant filter
  4. 加 operational_events 記錄

### 11.2 階段 2：Phase B 修整時

- 修 `/manager` 戰情室成績資料讀錯表（讀 exam_results 而非 grades）
- 修 `/staff` 重複頁面（決定 drop 或 redirect 到 /admin）
- 修 `/reset-password` token timeout
- 清 `/announcements` 測試垃圾資料（手動，需 Telly 確認）

### 11.3 階段 3：Phase C 封測前

- 完整 e2e 測試含 tenant 隔離（§8 必做 #10）
- 個資查詢請求頁面（家長行使個資法權利）
- 個資同意書收集流程（migration 002 的 consent_records）

### 11.4 階段 4（8 月後，AI 化）

本文件 §3-6 的 pattern 同樣適用。AI 化時還會加：
- `lib/anthropicClient.ts`（呼叫 Claude API）
- ai_usage_log 寫入 pattern
- Prompt Caching / Batch API 使用約定

---

## 12. 給未來 AI 工具的閱讀順序

任何 AI 工具（Cowork、Claude Code、Claude in Chrome）進入此 repo 工作前，**必讀順序**：

1. `Tom_Bear_AI化優化報告_v3.0.md` — 第 0 章（方向轉向）、第 13 章（協作流程 + 三紅線）
2. `docs/week0-tech-decisions.md` — 全部
3. `docs/week0-schema-audit.md` — 第 0-2 節（現況摘要）
4. **本文件** `docs/backend-conventions.md` — 全部
5. `supabase/migrations/README.md` + `*_999_PRE_FLIGHT_CHECKLIST.md`

跳過任一項都可能違反 §1 三紅線。

---

## 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |

---

**文件結束**

> 任何修改本規範請先與 Telly 走第 13 章協作流程確認。本文件是「應用程式碼如何活在 Phase A 新架構下」的標準作業手冊。
