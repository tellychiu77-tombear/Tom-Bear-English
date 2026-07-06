# Staging 演練 Runbook（migration 000→012）

目標：在測試專案完整演練 migration，驗收通過後才碰 production。
所有指令都在 PowerShell、專案資料夾內執行。連線字串只留在你電腦。

---

## Step 1：建立測試專案

1. 到 https://supabase.com/dashboard → **New project**
2. 名稱 `tombear-staging`，密碼自己設一組（記下來），region 選 Tokyo 或 Singapore
3. 等它建好（約 2 分鐘）

## Step 2：拿兩條連線字串

兩個專案各拿一條：Dashboard → 上方 **Connect** 按鈕 → **Session pooler** 的 URI
（長得像 `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`，
把 `[YOUR-PASSWORD]` 換成該專案的資料庫密碼）

## Step 3：安裝工具 + 匯出 production 結構

```powershell
cd C:\Users\USER\.gemini\antigravity\scratch\mom-call-app
npm install --save-dev pg

$env:SOURCE_DB_URL = "<production 的連線字串>"
node scripts/db/dump-schema.mjs
```
成功會顯示表清單並產生 `supabase/baseline_from_prod.sql`（只有結構、沒有學生資料）。

## Step 4：staging 鋪底＋套用 migration

```powershell
$env:TARGET_DB_URL = "<staging 的連線字串>"

# 4a. 鋪 production 的結構
node scripts/db/apply.mjs supabase/baseline_from_prod.sql

# 4b. 塞假資料（測試帳號與學生）
node scripts/db/apply.mjs scripts/db/staging-seed.sql

# 4c. 依序套 001 → 012（000 已含在 baseline，跳過）
node scripts/db/apply.mjs `
  supabase/migrations/20260511_001_create_tenants_and_seed.sql `
  supabase/migrations/20260511_002_create_ops_audit_tables.sql `
  supabase/migrations/20260511_003_drop_dead_tables.sql `
  supabase/migrations/20260511_004_redirect_profile_fks_and_drop.sql `
  supabase/migrations/20260511_005_fix_contact_books_schema.sql `
  supabase/migrations/20260511_006_consolidate_student_phones.sql `
  supabase/migrations/20260511_007_add_tenant_id_to_business_tables.sql `
  supabase/migrations/20260511_008_pgcrypto_and_encryption.sql `
  supabase/migrations/20260511_009_search_hash_columns.sql `
  supabase/migrations/20260511_010_enable_rls_and_policies.sql `
  supabase/migrations/20260511_011_rpc_helper_functions.sql `
  supabase/migrations/20260702_012_role_level_rls_and_fixes.sql
```
任何一支失敗會自動 ROLLBACK 並停下——把錯誤訊息整段貼給 Claude。

⚠️ **不要套** 013、014（需要程式碼配合，apply.mjs 也會擋）。

## Step 5：驗收

```powershell
node scripts/db/acceptance.mjs
```
23 項測試全部 ✅ 才算過關。核心：家長 A 讀不到家長 B 的小孩。

## Step 6：（可選）App 連 staging 實測

把 `.env.local` 與 `lib/supabaseClient.ts` 暫時指向 staging 的 URL/anon key，
`npm run dev` 用測試帳號登入點一輪。測完記得改回來。

---

## Production 上線（演練全綠之後）

1. **備份**：Dashboard → Table Editor → 對每張有資料的表 Export CSV
   （students, users, exam_results, leave_requests, payment_records, schedule_slots,
   chat_messages, contact_books, attendance_records, teacher_assignments, role_configs）
2. 挑離峰時段（晚上 10 點後）
3. `$env:TARGET_DB_URL = "<production 連線字串>"` 後重跑 Step 4c（同樣的 12 支）
4. `node scripts/db/acceptance.mjs` — ⚠️ production 沒有測試帳號，部分測試會失敗屬正常；
   改用真帳號在 app 實測：家長登入只看到自己小孩、老師點名正常
5. 完成後到 Dashboard → Settings → Database → **Reset database password**
   （換掉曾出現在 PowerShell 的密碼，好習慣）
