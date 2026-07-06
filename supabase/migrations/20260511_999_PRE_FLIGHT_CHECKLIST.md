# Phase A Migrations — Pre-flight Checklist

> **這是 Telly 回國後、實際套用 migration 之前必做的人工檢查清單**
> 跳過任何一項都可能導致 production 資料損失或服務中斷。
> 撰寫日期：2026-05-08 by Claude

---

## 完整流程（6 個 stage、共 8 個 checklist gate）

實際執行**不是「8 件事全做完才開始套 migrations」**，而是分階段交錯：

```
Stage 0  平行準備（gate 1, 3, 4, 7, 8）
Stage 1  建 Preview Branch（gate 2）
Stage 2  在 Preview 跑 migrations 001-007
Stage 3  Auth Hook 設定（gate 5）⚠️ 必須在此時，不能更早
Stage 4  在 Preview 跑 migrations 008-011
Stage 5  在 Preview 驗證 4 大類
Stage 6  Merge to Production
```

詳細視覺時序見對話中的 `phase_a_preflight_sequence` 視覺化。下面 8 個 gate 標明在哪個 Stage 執行。

---

## ⛔ 還沒做完下面 8 個 gate，**不要** 套用 migrations 到 production

### ✅ 1. Supabase Pro 已升級 [Stage 0]

- [ ] 在 Supabase Dashboard → Project Settings → Billing → 升級到 Pro
- [ ] Daily Backup 已啟用（Pro 預設）
- [ ] PITR（Point-In-Time Recovery）已啟用
- [ ] 月費 NT$775 已扣款成功（未付款 Pro 功能不會 active）

### ✅ 2. Preview Branch 已建立 [Stage 1]

- [ ] 在 Supabase Dashboard → Branches → Create branch (從 main)
- [ ] 命名建議：`phase-a-trial`
- [ ] Telly 切換到 preview branch 後跑一次 `supabase db push` 確認連線正常
- [ ] **所有 migration 先在 preview branch 跑過驗證無錯，再 push 到 main**

### ✅ 3. CSV 備份已 export [Stage 0]

對下列 6 張「真實有資料」的表，跑 SELECT 並下載成 CSV 存到本地（建議放 `mom-call-app/backups/2026-05-XX/`，並 git ignore）：

- [ ] `students` (152 rows)
- [ ] `exam_results` (924 rows)
- [ ] `leave_requests` (96 rows)
- [ ] `payment_records` (15 rows)
- [ ] `users` (23 rows)
- [ ] `schedule_slots` (33 rows)

⚠️ CSV 含真實學生個資 — 存放後**絕不上 git**，使用完應 secure-delete（不是放回收筒）。

### ✅ 4. Encryption key 已產生並存入 Supabase Vault [Stage 0 + Stage 1]

- [ ] 產生強隨機 key（256 bit），例：`openssl rand -base64 32`
- [ ] 在 Supabase Dashboard → Settings → Vault → 建立 secret：
  - Name: `app_encryption_key`
  - Secret value: <key 1>
- [ ] 另外產一個 hash key（與 encryption key 分開）：
  - Name: `app_hash_key`
  - Secret value: <key 2>
- [ ] **離線備份這兩個 key**（1Password / 加密 USB / 紙本保險箱）
- [ ] ⚠️ Key 一旦遺失，加密資料**永遠無法解開**

**完整的 key 災難應變 SOP**（外洩、輪換、員工離職等情境）見 [`../../docs/encryption-key-rotation-runbook.md`](../../docs/encryption-key-rotation-runbook.md)。

### ✅ 5. Supabase Auth Hook 已設定 [Stage 3 — ⚠️ 順序敏感]

⚠️ **此 gate 必須在 migrations 001-007 都跑完之後才做**。理由：Auth Hook function 會從 `public.users` 表撈 `tenant_id`，但這個欄位是 migration 007 才加的。在 007 前 setup hook 沒有意義（會撈到 NULL）。

JWT 必須含 `tenant_id` 與 `role` claim，migration 010 的 RLS 才能 enforce 隔離。

**完整逐步指引在 [`../../docs/supabase-auth-hook-setup.md`](../../docs/supabase-auth-hook-setup.md)** — 含 SQL、Dashboard 操作、jwt.io 驗證、troubleshooting。

摘要：
- [ ] 在 SQL Editor 建立 `public.custom_access_token_hook` function
- [ ] GRANT EXECUTE 給 supabase_auth_admin + GRANT SELECT users 表
- [ ] Dashboard → Authentication → Hooks → 啟用此 function
- [ ] 登出再登入，用 jwt.io 解碼確認 JWT 含 `tenant_id`、`role`、`is_approved`
- [ ] 把 Telly 自己的 user.role 改成 `platform_admin`（必做，否則跨 tenant 看不到資料）

### ✅ 6. Telly 已 review 過所有 migration 檔案 [Stage 0]

- [ ] `001_create_tenants_and_seed.sql` — tenants 表設計合理
- [ ] `002_create_ops_audit_tables.sql` — 4 張新表結構 OK
- [ ] `003_drop_dead_tables.sql` — 確認 9 張表都不可惜（特別 system_logs 10 rows）
- [ ] `004_redirect_profile_fks_and_drop.sql` — profiles drop 不影響流程
- [ ] `005_fix_contact_books_schema.sql` — contact_books 新欄位涵蓋需求
- [ ] `006_consolidate_student_phones.sql` — 主/備用聯絡人結構合理
- [ ] `007_add_tenant_id_to_business_tables.sql` — 沒漏表
- [ ] `008_pgcrypto_and_encryption.sql` — 加密欄位範圍合理
- [ ] `009_search_hash_columns.sql` — 需搜尋的欄位都有 hash
- [ ] `010_enable_rls_and_policies.sql` — RLS policies 邏輯正確
- [ ] `011_rpc_helper_functions.sql` — RPC 介面符合 backend-conventions.md §4-5

### ✅ 7. backend-conventions.md 已 review [Stage 0]

- [ ] [`../../docs/backend-conventions.md`](../../docs/backend-conventions.md) §2 三層 Client 架構
- [ ] §8 禁止 vs 必做的 Pattern 清單
- [ ] §11 Phase A 之後的 code 演進路線

### ✅ 8. data-dictionary.md 已 review [Stage 0]

- [ ] [`../../docs/data-dictionary.md`](../../docs/data-dictionary.md) — operational_events 事件字典，確認 event_type 命名 + payload 結構合理

---

## 🚀 套用流程（在 preview branch）

### 共通起手式

```bash
# 切到 preview branch（每次 session 開頭）
cd mom-call-app
supabase link --project-ref peuftkzxuxvdtixhudda
supabase branches checkout phase-a-trial
```

### Stage 2：跑 migrations 001-007（schema + multi-tenant 重組）

⚠️ 推薦走 **Dashboard SQL Editor 手動逐支**，不要用 `supabase db push --include-all`。理由：要在 007 跑完之後**暫停**去設 Auth Hook，CLI 沒辦法中途暫停。

```
方法：Dashboard → SQL Editor → 開新 query
1. 把 001_*.sql 內容貼到 SQL Editor → Run → 確認無錯
2. 跑 002 → Run → 確認無錯
3. ⋯⋯依序跑到 007
4. 暫停！進 Stage 3
```

每支跑完看「Verification」段（檔案末尾），手動 query 確認結果。

### Stage 3：Auth Hook 設定（migration 007 完成後）

→ 完整步驟見 [`../../docs/supabase-auth-hook-setup.md`](../../docs/supabase-auth-hook-setup.md) §3 Step 1-5。
→ 同時記得把 Telly user role 改成 `platform_admin`（同份文件 §4）。
→ 登出再登入用 jwt.io 解碼確認 `tenant_id`、`role`、`is_approved` 都在。

### Stage 4：跑 migrations 008-011（加密 + RLS + RPC）

⚠️ 跑這段之前必須先在 SQL Editor 跑：

```sql
SET app.encryption_key = '<從 Supabase Vault 複製>';
SET app.hash_key = '<從 Supabase Vault 複製>';
```

兩個 key **同一個 SQL session** 內要設定，下面 008-011 才能用。然後：

```
1. 開 008_*.sql → Run → 確認加密驗證 round-trip 通過
2. 開 009_*.sql → Run → 確認 search hash 副欄存在
3. 開 010_*.sql → Run → 確認 RLS 啟用 + policies 都建立
4. 開 011_*.sql → Run → 確認 RPC functions 存在
```

## ✅ Stage 5：驗證項目（preview branch 跑完 migrations 後）

### 結構驗證

- [ ] `tenants` 表存在，且有一筆 short_code='tombear'
- [ ] 所有業務表都有 `tenant_id` 欄位（NOT NULL，FK to tenants）
- [ ] dead 表已 drop（profiles, system_logs, grades, daily_reports 等）
- [ ] `contact_books` 重建，`student_id` 是 uuid 型態
- [ ] `students` 表的 phone 已合併（無 parent_phone_1/2、有 primary/secondary_contact_phone）
- [ ] `operational_events`, `ai_usage_log`, `access_log`, `consent_records` 存在

### 加密驗證

- [ ] 隨機抽 5 筆 students，直接 SELECT chinese_name_encrypted 看到亂碼
- [ ] 跑 `SELECT decrypt_pii(chinese_name_encrypted) FROM students LIMIT 5;` 解出原姓名（需 SET key）
- [ ] 搜尋 hash 比對成功：
  ```sql
  SELECT id FROM students 
  WHERE chinese_name_search_hash = hash_for_search('王小明');
  ```

### RLS 隔離驗證

- [ ] 用 tenant A 帳號登入（JWT 含 tenant_id_A），SELECT students → 只看到 tenant A 的學生
- [ ] 用 tenant B 帳號登入，SELECT students → 看不到 tenant A 的資料
- [ ] 用 platform_admin 帳號（Telly），SELECT students → 看到所有 tenant

### 應用層驗證

- [ ] `/students` 還能列出 152 學生
- [ ] `/leave` 還能看到 96 筆請假
- [ ] `/payment` 還能看到繳費紀錄
- [ ] `/manager` 戰情室現在能正確顯示成績平均（migration 不修這個，需另外 fix）

---

## Stage 6：套用 production 的時機

只在以下條件**全部滿足**才套用 production：

1. ✅ Preview branch 跑過所有 migrations 無錯
2. ✅ Preview branch 上的驗證全數通過
3. ✅ Telly 親自登入 preview 環境跑過老師日常工作流程 30 分鐘無異常
4. ✅ 已通知所有現有使用者「系統將於 X 時間維護 1 小時」
5. ✅ 維護時段選擇低峰時段（建議補習班晚上 21:00 後）

套用方法：

```bash
supabase branches merge phase-a-trial
# 或在 Dashboard 上點 "Merge to main"
```

---

## 🆘 如果套用過程出大事

按優先順序執行：

1. **不要 panic** — Supabase Pro 有 PITR，可還原到任意時間點
2. 立刻在 Dashboard → Database → Backups → Point-in-Time Recovery → 選 migration 套用前的時間點
3. 確認還原成功後，跟 Claude 一起 debug，修改 migration 內容
4. 在 preview branch 重新驗證
5. 重來

PITR 還原大約 5-15 分鐘完成。期間應用會 read 失敗，但不會永久損壞。

---

## 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |
| 2026-05-27 | v1.1 修正：(1) 「6 件事」typo → 「8 個 gate」 (2) 把 Auth Hook 從 gate 5 「migration 前」修正為「Stage 3 — migration 007 後」 (3) 套用流程拆成 Stage 2 / Stage 4 兩段以對應 Auth Hook 時機 (4) 各 gate 標示對應 Stage | Claude（Telly 回國 review 後同意修訂）|
| 2026-05-27 | **Telly 5 個設計決策 signoff**：①Tom Bear 設 platform tier、②consent 拆 3 同意項、③drop system_logs（接受 10 rows 資料丟失）、⑤contact_books 含 appetite 欄位、⑧Phase A 暫保留明文+加密雙存、⑩drop 74 條 legacy RLS policies — 全部通過。前提：執行時不影響主架構與既有可用功能。| Telly + Claude |
