# Week 0 Schema Audit — Supabase 現況盤點

> **執行時間**：2026-05-08
> **執行方式**：透過 Claude in Chrome 對 Supabase Dashboard SQL Editor 執行 introspection 查詢
> **Project**：`peuftkzxuxvdtixhudda` (tellychiu77@gmail.com's Project / Tom Bear)
> **環境**：⚠️ **PRODUCTION**（不是 staging — 見下方環境澄清）
> **執行者**：Claude（透過 Telly 已登入的 browser session，唯讀查詢）
> **配套文件**：[`week0-tech-decisions.md`](./week0-tech-decisions.md)

---

## 0. 執行摘要（Executive Summary）

| 項目 | 數值 | 狀態 |
|------|------|------|
| 實際資料表數量 | 28 + 1 view | ⚠️ PROJECT_BLUEPRINT.md 只列 17 張 |
| 總欄位數 | 246 | — |
| 外鍵數量 | 23 | — |
| RLS 啟用率 | 20/28 (71%) | ⚠️ 但多張關鍵表的 RLS 失效（見第 4 節） |
| RLS policies 總數 | 74 條 | ⚠️ 部分為 dead policies |
| 有真實資料的表數 | 14/28 | 其他 14 張表 0 rows（dead/duplicate） |

**5 個必須在 Phase A 處理的關鍵問題**：

1. ⚠️ **這是 PRODUCTION 環境**（152 學生 + 924 成績），而非 Telly 之前認知的 staging
2. ⚠️ **profiles vs users 雙軌混亂**：兩張使用者表並存，FK 指向不一致
3. ⚠️ **3 套接送表 + 2 套訊息表 + 2 套日報表 + 2 套 log 表並存**：累積的 dead schema
4. ⚠️ **6 張表的 `student_id` 是 bigint**，而 `students.id` 是 uuid → FK 永遠連不到，這 6 張表都廢
5. ⚠️ **7 張關鍵表的 RLS 已停用但有殘留 policies**：包含 students、users、profiles — **目前資料無實質 RLS 保護**

---

## 1. 環境澄清 — 重要

Telly 在 5/8 對話時答覆「老師測試環境是 staging/preview」，但實際盤點顯示這是 PRODUCTION 環境（main branch + production badge）。

**目前 production 資料規模**：

| 表 | 筆數 | 說明 |
|----|------|------|
| `exam_results` | **924** | 真實考試成績 |
| `students` | **152** | 真實學生 |
| `leave_requests` | **96** | 真實請假紀錄 |
| `schedule_slots` | 33 | 排課表 |
| `users` | 23 | 員工 + 家長帳號 |
| `payment_records` | 15 | 真實繳費紀錄 |
| `system_logs` | 10 | 系統日誌 |
| `attendance_records` | 6 | 出缺席紀錄 |
| `pickup_requests` | 3 | 接送請求 |
| `chat_messages` | 3 | 聊天紀錄 |
| `audit_logs` | 4 | 操作日誌 |

**對 Phase A 的影響（極重要）**：

❌ 不能像對 staging 那樣「無痛重構 schema」
✅ 動 schema 前必須備份（Supabase 自動備份要確認啟用）
✅ 任何 destructive 操作（drop column / drop table）必須先 export 資料
✅ 動 production 之前最好先在另一個環境練一次（建議建立 Supabase preview branch）

**建議行動**：
1. 確認 Supabase Pro 的 daily backup 已啟用（免費版只有 PITR）
2. Phase A 第 0.5 週：建立 Supabase preview branch 作為 schema 重構的演練場
3. **在 Phase A 動工前先全表 export 一份 CSV 備份**

---

## 2. 完整 28 張表盤點

### 2.1 表一覽 + 對 PROJECT_BLUEPRINT.md 的差異

| 表名 | 欄位數 | rows | RLS | Policies | 在 BLUEPRINT 嗎？ | 狀態判斷 |
|------|-------|------|-----|----------|------------------|---------|
| announcement_reads | 4 | 4 | ✅ | 2 | ✅ | 正常 |
| announcements | 7 | 1 | ✅ | 1 | ✅ | 正常 |
| attendance_records | 9 | 6 | ✅ | 1 | ✅ | 正常 |
| audit_logs | 7 | 4 | ✅ | 2 | ✅ | 正常（但跟 system_logs 重複） |
| chat_messages | 6 | 3 | ❌ | 1 | ✅ | ⚠️ RLS 沒開但有 policy |
| class_assignments | 4 | 0 | ✅ | 4 | ❌ 未紀錄 | ⚠️ 0 rows，疑似廢棄 |
| classes | 3 | 0 | ❌ | 2 | ❌ 未紀錄 | ⚠️ 0 rows，疑似廢棄 |
| contact_books | 21 | 0 | ✅ | 5 | ✅ | ⚠️ 0 rows！老師沒在用？ |
| course_sessions | 10 | 0 | ✅ | 1 | ✅ | ⚠️ 0 rows |
| daily_reports | 11 | 0 | ✅ | 2 | ❌ 未紀錄 | ⚠️ 跟 contact_books 重複（舊版） |
| exam_results | 10 | **924** | ✅ | 3 | ✅ | 正常（主要成績資料） |
| grades | 7 | 0 | ✅ | 1 | ❌ 未紀錄 | ⚠️ 跟 exam_results 重複（dead） |
| leave_requests | 8 | 96 | ✅ | 3 | ✅ | 正常 |
| messages | 6 | 0 | ❌ | 2 | ⚠️ BLUEPRINT 提過 | ⚠️ 跟 chat_messages 重複（舊版） |
| messages_view | 8 | (view) | — | — | ❌ 未紀錄 | View，不是 base table |
| parent_student_link | 4 | 0 | ✅ | 1 | ❌ 未紀錄 | ⚠️ 0 rows，type 不對 |
| payment_records | 10 | 15 | ✅ | 1 | ✅ | 正常 |
| pick_up_queue | 4 | 0 | ❌ | 0 | ✅ BLUEPRINT 標「舊版」 | ⚠️ 0 rows，廢棄 |
| pickup_requests | 5 | 3 | ✅ | 1 | ✅ BLUEPRINT 標「新版」 | 正常 |
| pickups | 4 | 0 | ❌ | 3 | ❌ 未紀錄 | ⚠️ 第三套接送表！廢棄 |
| profiles | 14 | 0 | ❌ | 8 | ❌ 未紀錄 | ⚠️ 跟 users 重複！見第 3 節 |
| role_configs | 3 | 6 | ✅ | 1 | ✅ | 正常 |
| schedule_slots | 11 | 33 | ✅ | 1 | ✅ | 正常 |
| student_link_requests | 11 | 0 | ✅ | 1 | ⚠️ BLUEPRINT 寫 `parent_binding_requests` | 改名了 |
| student_progress_notes | 6 | 0 | ✅ | 1 | ✅ | 0 rows |
| students | 26 | **152** | ❌ | 7 | ✅ | ⚠️ RLS 沒開但有 policy！ |
| system_logs | 5 | 10 | ✅ | 3 | ❌ 未紀錄 | ⚠️ 跟 audit_logs 重複 |
| teacher_assignments | 6 | 1 | ✅ | 1 | ✅ | 正常 |
| users | 16 | 23 | ❌ | 15 | ✅ | ⚠️ RLS 沒開但有 15 個 policy！ |

### 2.2 PROJECT_BLUEPRINT.md 漏記的表（需補進文件）

```
class_assignments     — 4 cols, 0 rows
classes               — 3 cols, 0 rows
daily_reports         — 11 cols, 0 rows（contact_books 的舊版）
grades                — 7 cols, 0 rows（exam_results 的舊版）
messages_view         — 8 cols, view（不是 table）
parent_student_link   — 4 cols, 0 rows（與 students.parent_id 重複）
pickups               — 4 cols, 0 rows（第三套接送表）
profiles              — 14 cols, 0 rows（與 users 重複，沒在用）
student_link_requests — 11 cols, 0 rows（BLUEPRINT 寫錯名稱為 parent_binding_requests）
system_logs           — 5 cols, 10 rows（與 audit_logs 重複）
```

### 2.3 PROJECT_BLUEPRINT.md 寫到但不存在的表

```
parent_binding_requests — DB 中實際叫 student_link_requests
```

---

## 3. 嚴重問題：profiles 與 users 雙軌混亂

### 3.1 兩張使用者表並存

**`users` 表**（16 cols, 23 rows — 真實員工/家長）：

```
id, role, name, contact_info(jsonb), email, is_super_admin, 
responsible_classes, is_approved, extra_permissions(jsonb), 
teacher_type, available_days(int[]), job_title, department,
pending_role, phone, created_at
```

**`profiles` 表**（14 cols, 0 rows — 沒人在用）：

```
id, email, role, department, assigned_class, full_name, phone,
user_type, child_name, child_class, responsible_classes(text[]),
job_title, created_at, updated_at
```

### 3.2 FK 指向混亂

實際的 23 個 FK 中：

- 11 個指向 `users.id`（attendance_records, chat_messages, course_sessions, payment_records, pickup_requests, schedule_slots × 2, student_link_requests × 2, students × 2, teacher_assignments）
- 2 個指向 `profiles.id`（contact_books.teacher_id, messages.sender_id）

**結論**：profiles 是 dead 但有 2 個外鍵指它，且 contact_books 是 BLUEPRINT 列為核心模組之一。

### 3.3 Phase A 的處理建議

**選項 A：保留 users，drop profiles**（推薦）
- profiles 0 rows，drop 不影響任何資料
- 改 contact_books.teacher_id 與 messages.sender_id 的 FK 指向 users.id
- 工作量：1-2 小時

**選項 B：遷移到 profiles**（不推薦）
- 需要把 users 的 23 筆資料搬到 profiles
- 涉及所有 FK 切換
- 工作量：1-2 天 + 高風險

**待 Telly 拍板**：用選項 A 嗎？

---

## 4. 嚴重問題：6 張表的 student_id 型態錯誤

### 4.1 `students.id` 是 uuid，但下列表的 `student_id` 是 bigint

```
contact_books.student_id      = bigint  ❌ (應該是 uuid)
daily_reports.student_id      = bigint  ❌
grades.student_id             = bigint  ❌
parent_student_link.student_id = bigint ❌
pick_up_queue.student_id      = bigint  ❌
pickups.student_id            = bigint  ❌
messages.student_id           = bigint  ❌
messages_view.student_id      = bigint  (view 反映底下表)
```

### 4.2 對應的 row counts 全是 0

這 7 張表（除 messages_view）目前全部 0 rows。這意味著：

- 它們從來沒被真正使用過
- 程式碼可能曾經 INSERT 過但都失敗（型態不符）
- 或這些表被遺棄了

### 4.3 Phase A 的處理

✅ **直接 drop 全部 7 張表**：
```sql
DROP TABLE IF EXISTS contact_books, daily_reports, grades, parent_student_link, pick_up_queue, pickups, messages CASCADE;
DROP VIEW IF EXISTS messages_view CASCADE;
```

⚠️ 但 BLUEPRINT 把 `contact_books` 列為核心模組之一！這意味著：
- 程式碼可能引用 `contact_books` 但永遠寫入失敗（沒人發現）
- 或者老師根本沒用聯絡簿功能
- **必須跟 Telly 確認**：聯絡簿在 production 真的有人用嗎？

---

## 5. RLS 失效現況 — 7 張表「有 policy 但沒啟用」

### 5.1 RLS 配置矛盾的表

| 表 | rls_enabled | policy_count | 風險 |
|----|------------|-------------|------|
| **users** | ❌ false | **15** | 員工 + 家長資料完全無保護 |
| **students** | ❌ false | **7** | 152 筆學生資料完全無保護 |
| **profiles** | ❌ false | 8 | 雖然 0 rows 但定義在這 |
| chat_messages | ❌ false | 1 | 3 筆訊息無保護 |
| classes | ❌ false | 2 | 0 rows |
| messages | ❌ false | 2 | 0 rows |
| pickups | ❌ false | 3 | 0 rows |

### 5.2 含義

「有 policy 但 rowsecurity = false」意味著 **policies 都被忽略**，任何登入用戶都能讀寫所有資料（受限於應用層 filter，但那是 Layer 2）。

**目前資料的實質保護來自於應用層 query filter**（`lib/permissions.ts`），不是 DB 層。這個對 Phase A 說的「RLS-based multi-tenant」是空白支票 — 我們得從零建立。

### 5.3 Phase A 第 2 週執行

1. 對 7 張關鍵表 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
2. 重寫所有 policies（v3.0 §10.6 的 tenant_id-based 規則）
3. 把現有的 74 條 policies 全部 audit 過 → drop 不需要的 → 重寫該保留的

**這比預期的工作量還大**，可能要從 2 週推到 2.5 週。

---

## 6. PII 欄位清單（Phase A 第 3 週要加密的對象）

### 6.1 確定要 pgcrypto 加密的欄位

| 表 | 欄位 | 型態 | 含 |
|----|------|------|-----|
| students | chinese_name | text | 學生本名 |
| students | english_name | text | 學生英文名 |
| students | parent_phone | text | 家長電話 1 |
| students | parent_phone_1 | text | 家長電話 1（重複） |
| students | parent_phone_2 | text | 家長電話 2 |
| students | parent_2_phone | text | 家長 2 電話 |
| students | birthday | date | 生日 |
| students | photo_url | text | 學生照片 |
| students | allergies | text | 過敏資訊 |
| students | special_needs | text | 特殊需求 |
| students | learning_goal | text | 學習目標 |
| students | parent_relationship | text | 親子關係 |
| students | parent_2_relationship | text | 第二親子關係 |
| users | name | text | 員工本名 |
| users | email | text | Email |
| users | phone | text | 電話 |
| users | contact_info | jsonb | 雜項聯絡資訊 |
| exam_results | student_name | text | 反正規化的學生姓名（建議移除這欄） |
| audit_logs | ip_address | text | 用戶 IP |
| system_logs | operator_email | text | 操作者 Email |

### 6.2 Phase A 第 3 週工作量重估

原本估計「2-3 天」加密欄位 — 實際盤點後發現：

- **18 個欄位需要加密**（比預期的 6-8 個多）
- 還有「重複欄位」要先合併（parent_phone vs parent_phone_1 vs parent_phone_2）
- 還要為每個欄位加 `_search_hash` 副欄

修訂估計：**4-5 天**（橫跨第 3-4 週初）

### 6.3 必須先合併的重複欄位

`students` 表有：
- `parent_phone` + `parent_phone_1` + `parent_phone_2` + `parent_2_phone`
- `parent_id` + `parent_id_2`

需先決定：是「爸爸 + 媽媽 = 兩個 parent record」還是「主要聯絡人 + 備用」？

**待 Telly 拍板資料模型** before encrypting。

---

## 7. 沒有 — Phase A 必須建立

下列 Phase A 必要的物件目前完全不存在，需從零建立：

| 物件 | 用途 | 建立時機 | v3.0 章節 |
|------|------|---------|-----------|
| `tenants` 表 | Multi-tenant 主表 | Phase A 第 1 週 | §10.3 |
| `tenant_id` 欄位（28 張表） | tenant 隔離 | Phase A 第 1-2 週 | §10.4 |
| Supabase Auth Hook | JWT custom claim | Phase A 第 2 週 | §10.6 |
| RLS policies（重寫）| tenant 隔離 | Phase A 第 2 週 | §10.6 |
| `operational_events` 表 | research-grade 事件池 | Phase A 第 1 週 | week0 §1.4 |
| `data-dictionary.md` | 事件字典 | Phase A 第 1 週 | week0 §2 |
| `ai_usage_log` 表 | 為日後 AI 化預埋 | Phase A 第 1 週 | v3.0 §9.4 |
| `access_log` 表 | 個資合規日誌 | Phase A 第 3 週 | v3.0 §6.2 |
| `_search_hash` 欄位（18 個欄位） | 加密欄位可搜尋 | Phase A 第 3 週 | week0 §1 決議 3 |
| 個資同意書頁面 + 紀錄表 | 個資合規 | Phase A 第 3 週 | v3.0 §6.2 |

---

## 8. 對 Phase A 工作量的修訂建議

原 v3.0 第 5 章 Phase A 估計 3 週。實際盤點後修訂：

| 週次 | 原計畫 | 修訂後 |
|------|-------|-------|
| 第 1 週 | Schema 補齊 + tenants 主表 | + Schema **清理**（drop 10 張 dead 表 + 解 profiles/users 矛盾）+ 建 operational_events / ai_usage_log |
| 第 2 週 | RLS + tenant_id 全表 | + 重寫 74 條既有 policies（不能直接套，要全 audit） |
| 第 3 週 | 個資合規 4 件事 | + students 表 4 個 phone 欄位合併 + 18 欄位加密（原預估 6-8 個） |

**結論**：Phase A 工作量比 v3.0 估計多約 30-40%，建議從 3 週擴充至 **3-4 週**（有可能延到 6/7 完成而非原訂 5/31）。

對應的 Phase B-D 可順延一週，整體 timeline 從 8/2 後延至 8/9。

**待 Telly 拍板**：是否同意 Phase A 加長 1 週？

---

## 9. Telly 待決議的問題清單

| # | 問題 | 影響 |
|---|------|------|
| 1 | 環境是 production，要不要建 preview branch 作 Phase A 演練場？ | 動 schema 風險管控 |
| 2 | 確認 daily backup 已啟用？ | 災難恢復 |
| 3 | profiles 表確定 drop？（選項 A） | 解決 user 雙軌 |
| 4 | drop 6 張型態錯誤的廢表？（contact_books, daily_reports, grades, parent_student_link, pick_up_queue, pickups, messages） | 但 contact_books 是核心模組 — 真的沒在用嗎？ |
| 5 | drop system_logs 還是 audit_logs？保留哪個 log 系統？ | 統一 log 結構 |
| 6 | students 表的 4 個 phone 欄位怎麼合併？「主要聯絡人 + 備用」還是「爸爸 + 媽媽」？ | 個資加密前決定 |
| 7 | 同意 Phase A 加長 1 週（從 3 週到 4 週）？ | Timeline 修訂 |

---

## 10. 完整 schema snapshot（raw data）

完整的 columns / FK / RLS / row_count 詳細資料已透過 browser session 取得。

由於含個資結構資訊，**raw JSON 不存在 repo**（會被 .gitignore），如有需要重新取得，可由 Claude 透過 Supabase Dashboard 重跑相同的 introspection mega query。

---

## 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 建立（Schema audit 第一次完整盤點） | Claude（透過 Telly 已登入 browser） |

---

**文件結束**

> 本文件為 Phase A 第 1 週開工前的最後一份參考。所有後續 schema 改動以本盤點為準。
