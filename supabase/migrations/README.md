# Phase A Migrations — 套用前必讀

> **撰寫日期**：2026-05-08（Telly 出差大陸期間，Claude 自主撰寫）
> **狀態**：⚠️ **草稿，尚未套用到任何資料庫**
> **預計套用時間**：Telly 回國 + Supabase Pro 升級 + preview branch 建立 + CSV 備份完成 **之後**
> **規範來源**：[`../../Tom_Bear_AI化優化報告_v3.0.md`](../../Tom_Bear_AI化優化報告_v3.0.md) 第 10 章、[`../../docs/week0-tech-decisions.md`](../../docs/week0-tech-decisions.md)、[`../../docs/week0-schema-audit.md`](../../docs/week0-schema-audit.md)

---

## 套用順序與相依

各 migration 必須**依編號順序套用**，編號間有相依關係：

| # | 檔案 | 目的 | 風險 | 相依 |
|---|------|------|------|------|
| 000 | `20260511_000_add_course_progress.sql` | 課程進度表（已存在於 live DB 的 baseline；2026-07-02 由 `add_course_progress.sql` 改名，確保排序在最前） | 🟢 低 | 無 |
| 001 | `20260511_001_create_tenants_and_seed.sql` | 建 tenants 主表 + seed Tom Bear | 🟢 低 | 無 |
| 002 | `20260511_002_create_ops_audit_tables.sql` | 建 operational_events / ai_usage_log / access_log / consent_records | 🟢 低 | 001 |
| 003 | `20260511_003_drop_dead_tables.sql` | drop 9 張無人用 dead 表 + 1 個 view（含 system_logs — 程式碼已於 2026-07-02 切換為寫 audit_logs ✅） | 🟡 中 | — |
| 004 | `20260511_004_redirect_profile_fks_and_drop.sql` | 把指向 profiles 的 FK 改指向 users，再 drop profiles | 🟡 中 | 003 |
| 005 | `20260511_005_fix_contact_books_schema.sql` | 重建 contact_books（修 student_id 型態）⚠️ 前端仍用舊欄位名（date/comment），套用前需程式碼配合 | 🟡 中 | 004 |
| 006 | `20260511_006_consolidate_student_phones.sql` | 合併 students 的 4 個 phone 欄位為 2 個（2026-07-02 修正：舊欄位 DROP 延後到 014） | 🟡 中 | — |
| 007 | `20260511_007_add_tenant_id_to_business_tables.sql` | 18 張業務表加 tenant_id + backfill + NOT NULL + index | 🟡 中 | 001-006 |
| 008 | `20260511_008_pgcrypto_and_encryption.sql` | 啟用 pgcrypto + 加密敏感欄位 | 🔴 高 | 007 |
| 009 | `20260511_009_search_hash_columns.sql` | 為加密欄位加 _search_hash 副欄 | 🟡 中 | 008 |
| 010 | `20260511_010_enable_rls_and_policies.sql` | 啟用 RLS + tenant 隔離 policies | 🔴 高 | 007 |
| 011 | `20260511_011_rpc_helper_functions.sql` | RPC helpers (set_session_keys, get_student_decrypted 等) | 🟢 低 | 008-010 |
| **012** | `20260702_012_role_level_rls_and_fixes.sql` | **🔥 封測關鍵**：角色級 RLS（家長只能讀自己小孩）、防提權 trigger、chat 欄位合併、FK CASCADE 修正、唯一鍵、RPC 收斂、綁定比對 RPC、聊天聯絡人 RPC | 🔴 高 | 010, 011 |
| 013 | `20260702_013_storage_private_bucket.sql` | 學生照片 bucket 轉私有（⚠️ 需程式碼改 signed URL 後才可全套用；Section 2 可先行） | 🟡 中 | 012 |
| 014 | `20260702_014_cleanup_legacy_columns.sql` | 清掉舊 phone 欄位與 chat_messages.content（⚠️ 需程式碼全面切換後才可套用） | 🔴 高 | 012 + 程式碼切換 |
| 999 | `20260511_999_PRE_FLIGHT_CHECKLIST.md` | 套用前必跑的人工檢查清單 | — | — |

> **2026-07-02 稽核補充**：
> 1. **Auth Hook 有致命 bug 已修正**：業務角色 claim 改名 `user_role`（原本覆寫 PostgREST 保留的 `role` 會全站 500），見 `docs/supabase-auth-hook-setup.md`。且 012 之後 RLS 改查 users 表判斷角色，Hook 未設定也不影響隔離正確性。
> 2. **chat_messages／pickup_requests 等現役表在 repo 中沒有 CREATE TABLE**。從零重建環境會失敗；請儘早跑 `supabase db pull` 產出 baseline。
> 3. 套用到 production 前，**必須先在 preview branch 走完 012 檔尾的驗收清單**。
>
> **2026-07-06 staging 演練結論（在 tombear-staging 實際跑過 baseline+seed+001→012）**：
> 1. **004 修正**：`redirect_profile_fks_and_drop.sql` 第 35 行 `SELECT constraint_name` 有欄位歧義（join 兩張系統表都有此欄位），已加 `tc.` 前綴。此 bug 若直接上 production 會中斷 migration。
> 2. **🔴 加密線（008 / 009 / 011）封測不上**：008 要求 `SET app.encryption_key` 才能跑，且加密後學生電話變密文、但 app 前端沒有任何解密 RPC 呼叫 → 家長／老師端會顯示亂碼，並破壞 012 的綁定電話比對。結論：**封測套用路徑 = 001-007 + 010 + 012**，加密留待封測後改走後端 Edge Function 重新設計。
> 3. **封測正式套用順序**（production 也照此）：001, 002, 003, 004, 005, 006, 007, 010, 012。**跳過 008, 009, 011**。013/014 需程式碼配合，更後面才套。

---

## ⚠️ 套用前必做的事（Pre-flight）

詳見 `20260511_999_PRE_FLIGHT_CHECKLIST.md`。摘要：

1. ✅ Supabase 已升級到 Pro 方案（有 daily backup）
2. ✅ 已建立 Supabase preview branch 作為演練場
3. ✅ 28 張表的 CSV 已 export 一份本地備份
4. ✅ Telly 已 review 過全部 migration 檔案
5. ✅ 已在 preview branch 跑過一次完整 migration 流程驗證無錯
6. ✅ 已確認 RLS 隔離測試通過（tenant B 看不到 tenant A）

---

## 套用方法

### 透過 Supabase CLI（推薦）

```bash
cd mom-call-app
supabase link --project-ref peuftkzxuxvdtixhudda
supabase db push --include-all
```

### 透過 Supabase Dashboard SQL Editor（手動，逐支）

依編號 001 → 010 順序，把每支 .sql 內容貼到 SQL Editor 執行。每支跑完先檢查無錯再跑下一支。

---

## Rollback 策略

每支 migration 檔案末尾都有 `-- ROLLBACK SCRIPT` 段落，包含「如果這支跑壞了，怎麼回到上一個狀態」的 SQL。

⚠️ 但 008（加密）和 010（RLS）的 rollback 後資料狀態會有微妙差異，**強烈建議靠 Supabase Pro 的 PITR 還原**，而不是手動 rollback。

---

## 各 migration 的詳細說明

每支 migration 檔案開頭的註解區塊包含：

- **Purpose**：這支要解決什麼問題
- **References**：對應 v3.0 報告 / week0 文件的哪一節
- **Changes**：實際做了什麼
- **Risk**：對 production 的潛在影響
- **Rollback**：如何回退

Telly 回國 review 時，從每支的開頭註解就能快速理解。
