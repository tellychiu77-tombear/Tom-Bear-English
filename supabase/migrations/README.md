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
> 3. 套用到 production 前，**必須先在 preview branch 走完 012 檔尾的驗收清單**�