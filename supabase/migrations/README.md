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
| 001 | `20260511_001_create_tenants_and_seed.sql` | 建 tenants 主表 + seed Tom Bear | 🟢 低 | 無 |
| 002 | `20260511_002_create_ops_audit_tables.sql` | 建 operational_events / ai_usage_log / access_log / consent_records | 🟢 低 | 001 |
| 003 | `20260511_003_drop_dead_tables.sql` | drop 9 張無人用 dead 表 + 1 個 view | 🟡 中 | — |
| 004 | `20260511_004_redirect_profile_fks_and_drop.sql` | 把指向 profiles 的 FK 改指向 users，再 drop profiles | 🟡 中 | 003 |
| 005 | `20260511_005_fix_contact_books_schema.sql` | 重建 contact_books（修 student_id 型態） | 🟡 中 | 004 |
| 006 | `20260511_006_consolidate_student_phones.sql` | 合併 students 的 4 個 phone 欄位為 2 個 | 🟡 中 | — |
| 007 | `20260511_007_add_tenant_id_to_business_tables.sql` | 28 張業務表加 tenant_id + backfill + NOT NULL + index | 🟡 中 | 001-006 |
| 008 | `20260511_008_pgcrypto_setup_and_pii_encryption.sql` | 啟用 pgcrypto + 加密敏感欄位 | 🔴 高 | 007 |
| 009 | `20260511_009_search_hash_columns.sql` | 為加密欄位加 _search_hash 副欄 | 🟡 中 | 008 |
| 010 | `20260511_010_enable_rls_and_policies.sql` | 啟用 RLS + 全套 tenant 隔離 policies | 🔴 高 | 007 |
| 011 | `20260511_011_rpc_helper_functions.sql` | RPC helpers (set_session_keys, get_student_decrypted, search_student_by_*, insert_student_with_encryption 等) | 🟢 低 | 008-010 |
| 999 | `20260511_999_PRE_FLIGHT_CHECKLIST.md` | 套用前必跑的人工檢查清單 | — | — |

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
