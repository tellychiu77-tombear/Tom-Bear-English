# Supabase Auth Hook 設定指南

> **目的**：讓 Supabase 發給每位使用者的 JWT 自動帶上 `tenant_id` 與 `role` claim，migration 010 的 RLS policy 才能 enforce tenant 隔離。
> **撰寫日期**：2026-05-08（Telly 出差期間，Claude 撰寫）
> **執行時機**：Telly 回國 → 升級 Supabase Pro → **完成 migration 001（建 tenants 表）→ 在這裡完成 Auth Hook 設定 → 才跑 migration 010**
> **規範來源**：[`../Tom_Bear_AI化優化報告_v3.0.md`](../Tom_Bear_AI化優化報告_v3.0.md) §10.6、[`backend-conventions.md`](./backend-conventions.md) §3
> **預估執行時間**：30-45 分鐘

---

## 0. 為什麼需要這個

Phase A migration 010 的 RLS policy 長這樣：

```sql
CREATE POLICY students_select_tenant ON students
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

也就是「只能讀到 JWT 裡 tenant_id 等於這筆資料 tenant_id 的 row」。

**問題**：預設的 Supabase JWT 只有 `sub`（user_id）、`email`、`role`(認證層的，不是業務層的) 等標準 claim。**沒有 `tenant_id`**。

**解決方案**：用 Custom Access Token Hook — 一個 PostgreSQL function，Supabase 每次發 JWT 之前都會呼叫它，讓我們可以從 `public.users` 表撈 `tenant_id` 與業務 `role`，注入 JWT。

---

## 1. 先決條件（沒做完不要動下面步驟）

- [ ] **Supabase Pro 已升級**（Free 方案 Auth Hooks 功能受限）
- [ ] **Migration 001 已套用**（`tenants` 表已存在）
- [ ] **Migration 007 已套用**（`public.users` 表已有 `tenant_id` 欄位）
- [ ] **Telly 的使用者已手動標記為 platform_admin**（見 §3.4）

---

## 2. 設定流程概覽

```
Step 1：在 SQL Editor 建立 custom_access_token_hook function
Step 2：授權 supabase_auth_admin 呼叫此 function 與讀 users 表
Step 3：在 Dashboard → Authentication → Hooks 啟用此 function
Step 4：登出再登入，用 jwt.io 解碼確認 tenant_id 已注入
Step 5：寫一個 RLS 隔離測試確認可運作
```

---

## 3. 詳細步驟

### Step 1：在 Supabase Dashboard → SQL Editor 跑這段 SQL

```sql
-- ==========================================================================
-- Custom Access Token Hook — 把 tenant_id 與 business role 注入 JWT
-- ==========================================================================
-- ⚠️⚠️ 2026-07-02 重大修正 ⚠️⚠️
-- 原版把業務角色寫進頂層 `role` claim —— 那是 PostgREST 的保留欄位
-- （用來做資料庫 SET ROLE，正常值必須是 'authenticated'）。
-- 一旦覆寫成 'teacher'/'parent'，Postgres 找不到同名 DB role，
-- 所有 API 請求會直接 500，全站癱瘓。
-- 修正：業務角色一律放在自訂 claim `user_role`。
--
-- 另注意：migration 012 之後，RLS 的角色判斷改為直接查 users 表，
-- 不再依賴 JWT claim —— 本 Hook 變成「輔助性質」（前端可讀 user_role 顯示身分），
-- 未設定也不影響 RLS 正確性。
--
-- 此 function 由 Supabase Auth 在每次發 access token 前呼叫。
-- 詳見 Supabase 官方文件：
--   https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE  -- 不修改資料庫狀態
AS $$
DECLARE
  claims jsonb;
  user_record record;
  user_id_uuid uuid;
BEGIN
  -- event 的格式（Supabase 傳入）：
  -- {
  --   "user_id": "...",
  --   "claims": { "aud": "...", "sub": "...", ... 標準 claims },
  --   "authentication_method": "..."
  -- }

  claims := COALESCE(event->'claims', '{}'::jsonb);
  user_id_uuid := (event->>'user_id')::uuid;

  -- 從 public.users 撈 tenant_id 與 business role
  SELECT u.tenant_id, u.role, u.is_approved
  INTO user_record
  FROM public.users u
  WHERE u.id = user_id_uuid;

  IF user_record IS NULL THEN
    -- 使用者剛註冊還沒有 users 表紀錄 → 給預設值
    -- 註冊流程應該在 onboarding 階段建立 users 紀錄，此處只是保險
    claims := jsonb_set(claims, '{tenant_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{user_role}', '"pending"'::jsonb);  -- ⚠️ 不可用 {role}（PostgREST 保留欄位）
    claims := jsonb_set(claims, '{is_approved}', 'false'::jsonb);
  ELSE
    -- 正常情況：注入業務層的 tenant_id 與 role
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_record.tenant_id));
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_record.role));  -- ⚠️ 不可用 {role}（PostgREST 保留欄位）
    claims := jsonb_set(claims, '{is_approved}', to_jsonb(user_record.is_approved));
  END IF;

  -- 把更新後的 claims 寫回 event
  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
EXCEPTION
  WHEN OTHERS THEN
    -- 任何錯誤都不應 block 登入。Log 起來，回原 event。
    RAISE WARNING 'custom_access_token_hook error: %', SQLERRM;
    RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Injects tenant_id, business role, is_approved into JWT claims. Called by Supabase Auth on every token issue/refresh.';
```

**確認 SQL 跑成功**：應該看到 `CREATE FUNCTION` 訊息，沒有錯誤。

### Step 2：授權 supabase_auth_admin 呼叫

Supabase Auth 用一個內建 role `supabase_auth_admin` 來呼叫 hook function，需明確授權：

```sql
-- 允許 supabase_auth_admin 呼叫此 function
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- 允許 supabase_auth_admin 讀 users 表（hook 內部需查 tenant_id 與 role）
GRANT SELECT ON TABLE public.users TO supabase_auth_admin;

-- ⚠️ supabase_auth_admin 不可受 RLS 限制（hook 要能讀任何 user 的 tenant_id）
-- 為此建一個專用 RLS bypass policy
CREATE POLICY users_auth_hook_bypass ON public.users
  FOR SELECT
  TO supabase_auth_admin
  USING (true);  -- supabase_auth_admin 看所有 row

-- 拒絕一般 authenticated user 透過此 policy 取得跨 tenant 資料
-- （migration 010 的其他 policies 仍然會限制一般使用者）
```

### Step 3：在 Dashboard 啟用 Hook

1. 打開 Supabase Dashboard
2. 左側選單 → **Authentication** → **Hooks**（不是 Settings 那個 Hooks，是 Auth 底下的）
3. 找到 **Custom Access Token Hook** 區塊
4. 點 **Enable hook**
5. **Hook URL** 選 `Postgres function`
6. **Postgres function** 下拉選 `public.custom_access_token_hook`
7. 點 **Save**

**確認設定生效**：頁面上應該顯示「Enabled」狀態，function 名稱為 `public.custom_access_token_hook`。

### Step 4：登出再登入測試

1. 在你的 app（localhost 或 production）**登出**目前的 TELLY session
2. 重新登入
3. 在 browser DevTools → Application → Local Storage / Cookies 找到 `sb-<project-ref>-auth-token`
4. 把 JWT 部分（一長串 `eyJ...` 開頭的字串）複製
5. 貼到 https://jwt.io 解碼
6. **預期看到的 claims**：

```json
{
  "aud": "authenticated",
  "exp": 1234567890,
  "iat": 1234567000,
  "iss": "https://peuftkzxuxvdtixhudda.supabase.co/auth/v1",
  "sub": "<your-uuid>",
  "email": "tellychiu77@gmail.com",
  
  "role": "authenticated",               ← 保留欄位，必須維持 authenticated（不可被覆寫！）
  "tenant_id": "<Tom Bear UUID>",       ← 必須出現！
  "user_role": "platform_admin",         ← 必須出現！（Telly 的話；2026-07-02 起改用 user_role）
  "is_approved": true                    ← 必須出現！
}
```

如果 `tenant_id` / `user_role` / `is_approved` 三個 claim 缺一，hook 沒運作 — 看 §5 troubleshooting。
⚠️ 若看到頂層 `role` 變成 teacher/parent 等業務角色 = hook 寫錯了，全站 API 會 500，立刻停用 hook。

### Step 5：寫一個 RLS 隔離測試確認

⚠️ 這步建議在 preview branch 做，不要動 production。

```sql
-- 建一個假 tenant + 一個假 student
INSERT INTO public.tenants (name, short_code, type, plan)
VALUES ('Fake Test School', 'fake_test', 'cram_school', 'trial')
RETURNING id;
-- 假設回傳 id = '<fake_tenant_uuid>'

-- 假裝 Telly（platform_admin）切換到此 tenant 看
SET LOCAL "request.jwt.claims" = '{"tenant_id":"<fake_tenant_uuid>","user_role":"platform_admin"}';

SELECT count(*) FROM public.students;
-- platform_admin 應看到所有 tenant 的學生（含真的 Tom Bear 152 + 假的 0 = 152）

-- 假裝是 fake_test tenant 的 teacher
SET LOCAL "request.jwt.claims" = '{"tenant_id":"<fake_tenant_uuid>","user_role":"teacher"}';

SELECT count(*) FROM public.students;
-- 應回 0（看不到 Tom Bear 的 152 個學生）

-- 清掉測試資料
RESET ALL;
DELETE FROM public.tenants WHERE short_code = 'fake_test';
```

如果第二段 SELECT 不是 0 → RLS 隔離失效，回去檢查 migration 010。

---

## 4. 把 Telly 的 user 標記為 platform_admin（重要）

migration 007 註解裡提到這步要手動做。在 SQL Editor 跑：

```sql
-- Step 4.1：找 Telly 的 user id
SELECT id, email, role, tenant_id FROM public.users WHERE email = 'tellychiu77@gmail.com';
-- 記下 id

-- Step 4.2：升級為 platform_admin
UPDATE public.users
SET role = 'platform_admin'
WHERE email = 'tellychiu77@gmail.com';

-- Step 4.3：驗證
SELECT id, email, role FROM public.users WHERE email = 'tellychiu77@gmail.com';
-- role 應顯示 'platform_admin'

-- Step 4.4：登出 + 重新登入，jwt.io 解碼確認 role 已變成 platform_admin
```

⚠️ **平台只能有 1 個 platform_admin**（你自己）。除非未來雇用合作夥伴，否則不要把其他人設成 platform_admin。

---

## 5. Troubleshooting

### 問題 5.1：JWT 內沒看到 tenant_id

**可能原因 A**：Hook 沒啟用

- 解法：回 Step 3，確認 Dashboard 顯示 Enabled
- 確認 function 名稱拼正確（`public.custom_access_token_hook`）

**可能原因 B**：users 表查不到該使用者

- 解法：跑 `SELECT * FROM public.users WHERE id = '<your-uuid>';`
- 如果沒有 row，代表註冊時沒在 users 表建紀錄 — 看 onboarding 流程
- 暫時手動 INSERT 一筆

**可能原因 C**：權限沒授對

```sql
-- 確認授權存在
SELECT * FROM information_schema.role_table_grants
WHERE grantee = 'supabase_auth_admin' AND table_name = 'users';

-- 如果空 — 重跑 Step 2 的 GRANT 語句
```

**可能原因 D**：Function 內 raise exception 但被 catch

- 解法：看 Supabase Dashboard → Logs → Postgres Logs，搜 'custom_access_token_hook error'
- 修 hook function 邏輯

### 問題 5.2：登入後一直 redirect 到 /login

JWT 沒帶到 `is_approved` 或 `role`，前端可能誤判為未授權。

- 解法：jwt.io 解碼看 claims 內容
- 如果只有 `aud`/`sub`/`email` 等標準 claim → hook 沒被叫
- 如果有 `tenant_id` 但 `is_approved=false` → 在 SQL 把該 user `is_approved=true`

### 問題 5.3：突然所有人都看不到資料

可能 RLS + Auth Hook 有衝突。緊急 disable RLS（不要 disable Hook）：

```sql
-- 暫時關掉所有業務表 RLS（緊急止血）
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
```

⚠️ 這會讓所有 tenant 互相看得到資料。**只在緊急情況用，5 分鐘內必須修好原因再開回來**。

---

## 6. 一個重要的觀念：Hook 不是即時的

Hook 在「發 access token」時被呼叫。也就是：

- 使用者**登入時**呼叫一次
- Access token **refresh 時**呼叫一次（預設每 1 小時）
- 之間：claims 不會變

**含義**：在 admin 後台改某老師的 `tenant_id` 或 `role`，他**不會立刻**看到變化。要等：

1. 他下次重新登入，OR
2. Access token 過期自動 refresh（最多 1 小時），OR
3. 強制把他登出（admin 端發 force-logout 訊號）

backend-conventions.md §11.1 的 lib 改造會處理「強制登出」機制（admin 改完 role/tenant 後自動發出 sign-out 訊號）。

---

## 7. Rollback：如果 Hook 出問題要立刻關掉

### Step 1：Dashboard 上 disable

Dashboard → Authentication → Hooks → Custom Access Token Hook → Disable

### Step 2：移除權限（選用）

```sql
-- 撤銷 supabase_auth_admin 對 users 表的 SELECT
REVOKE SELECT ON TABLE public.users FROM supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM supabase_auth_admin;

-- 刪除特權 policy
DROP POLICY IF EXISTS users_auth_hook_bypass ON public.users;
```

### Step 3：（可選）刪除 function

```sql
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
```

**Rollback 後果**：所有 JWT 不再有 `tenant_id` claim → migration 010 的 RLS policy 全部視為「不符合」→ **所有 query 看不到任何 row**。

也就是說 Hook disable 之後，必須**同時**：
- 要嘛把 RLS 也一起 disable（Step 5.3 緊急 SQL）
- 要嘛盡快修好 Hook 重新啟用

---

## 8. 驗證清單（套用完整 Phase A 後）

- [ ] `custom_access_token_hook` function 在 SQL Editor 可查到
- [ ] Dashboard → Auth → Hooks 顯示「Enabled」
- [ ] 自己登出再登入，JWT 解碼後含 `tenant_id`, `role`, `is_approved`
- [ ] Telly 的 role 是 `platform_admin`
- [ ] 假 tenant 隔離測試通過（platform_admin 看全部、teacher 看 0）
- [ ] 應用層登入流程正常，沒有意外 redirect

全部勾完才能進 Phase A 的下一階段（封測前修整）。

---

## 9. 進階：未來如何擴充 Hook

需要加新 claim（例如 `monthly_ai_quota_remaining`）：

```sql
-- 改 hook function，加 SELECT 與 jsonb_set
SELECT 
  u.tenant_id, u.role, u.is_approved,
  t.monthly_ai_token_limit - t.current_month_ai_tokens_used AS ai_quota_remaining
INTO user_record
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
WHERE u.id = user_id_uuid;

-- ...
claims := jsonb_set(claims, '{ai_quota_remaining}', to_jsonb(user_record.ai_quota_remaining));
```

⚠️ Claim 越多 JWT 越大。大型 SaaS 通常控制在 1KB 以下。台灣補教規模這個不是問題，但仍避免亂加。

---

## 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |

---

**文件結束**

> 任何修改 Hook 邏輯前，請先在 preview branch 演練。Hook 出錯會影響全平台登入體驗。
