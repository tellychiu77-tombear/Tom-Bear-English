# 湯貝爾 APP — 命名規範（NAMING CONVENTION）

> 每次新增或修改頁面前請對照此文件。
> 以「多數 code 的寫法」為標準，避免欄位名稱不一致導致資料抓不到。

---

## 一、主要資料表對照

### `users` 表（使用者 / 老師 / 家長帳號）

| 欄位名稱 | 型別 | 說明 | ⚠️ 禁止使用的錯誤寫法 |
|---------|------|------|------------------|
| `id` | uuid | 對應 auth.users.id | — |
| `name` | text | 使用者真實姓名 | ~~`full_name`~~ |
| `email` | text | 登入 Email | — |
| `role` | text | 角色（見下方角色清單） | — |
| `department` | text | 部門（english / after_school / general）| — |
| `job_title` | text | 職稱顯示名稱 | — |
| `is_approved` | boolean | 是否已通過審核 | — |
| `extra_permissions` | jsonb | 個人權限覆蓋設定 | — |
| `teacher_type` | text | 老師類型（foreign / external / staff） | — |
| `available_days` | int[] | 可來天數陣列（1=週一~5=週五） | — |

**角色（role）清單：**
- `director` — 總園長
- `english_director` — 英文部主任
- `care_director` — 安親部主任
- `manager` — 管理員
- `admin` — 行政人員
- `teacher` — 老師
- `parent` — 家長
- `pending` — 待審核

---

### `students` 表（學生資料）

| 欄位名稱 | 型別 | 說明 | ⚠️ 禁止使用的錯誤寫法 |
|---------|------|------|------------------|
| `id` | uuid | 學生 ID | — |
| `parent_id` | uuid | 家長 users.id | — |
| `chinese_name` | text | 學生中文姓名 | ~~`name`~~ |
| `english_name` | text | 學生英文姓名 | — |
| `grade` | text | 班級（格式見下方說明） | ~~`class_name`~~ |
| `school_grade` | text | 就讀年級（一年級 / 二年級...）| — |
| `birthday` | date | 生日 | — |
| `photo_url` | text | 照片 URL | — |
| `parent_name_1` | text | 家長一姓名 | — |
| `parent_phone_1` | text | 家長一電話 | — |
| `parent_name_2` | text | 家長二姓名 | — |
| `parent_phone_2` | text | 家長二電話 | — |
| `teacher_note` | text | 老師備註 | — |
| `internal_tags` | text[] | 內部標籤 | — |

**`grade` 欄位格式規範：**
```
純英文班：       "CEI-A"
英文班＋課後：   "CEI-A, 課後輔導班"
純課後輔導：     "課後輔導班"
未分班：         "未分班"
```

---

### `teacher_assignments` 表（老師負責設定）

| 欄位名稱 | 型別 | 說明 |
|---------|------|------|
| `id` | uuid | — |
| `teacher_id` | uuid | → users.id |
| `class_group` | text | 班級名稱（如 CEI-A） |
| `slot_type` | text | 課程類型（聽說 / 文法 / 閱讀 / 英文綜合 / 課後輔導）|
| `role` | text | lead（主教）/ assistant（助教）|

---

### `schedule_slots` 表（排課）

| 欄位名稱 | 型別 | 說明 |
|---------|------|------|
| `id` | uuid | — |
| `semester` | text | 學期（如 2025下）|
| `class_group` | text | 班級名稱 |
| `slot_type` | text | 課程類型 |
| `lead_teacher_id` | uuid | → users.id（主教）|
| `assistant_teacher_id` | uuid | → users.id（助教，可空）|
| `day_of_week` | int | 1=週一 ~ 5=週五 |
| `start_time` | time | 開始時間（如 15:00）|
| `end_time` | time | 結束時間（可空）|
| `note` | text | 備註（可空）|

---

## 二、Supabase 查詢寫法規範

### 正確寫法

```typescript
// ✅ 查詢使用者（用 name）
const { data } = await supabase.from('users').select('id, name, email, role');

// ✅ 查詢學生（用 chinese_name 和 grade）
const { data } = await supabase.from('students').select('id, chinese_name, grade, english_name');

// ✅ JOIN 查詢（固定別名格式）
const { data } = await supabase.from('students')
  .select('id, chinese_name, grade, parent:users!parent_id(id, name, email)');

// ✅ 新增使用者
await supabase.from('users').upsert({ id: userId, name: fullName, role: 'pending', is_approved: false });

// ✅ 新增學生
await supabase.from('students').insert({ parent_id: userId, chinese_name: name, grade: 'CEI-A' });
```

### 禁止寫法

```typescript
// ❌ 不要用 profiles 表（已廢棄）
supabase.from('profiles').insert({ full_name: ... })

// ❌ 不要用 full_name
supabase.from('users').select('full_name')

// ❌ 不要用 name 查學生（那是 users 表的欄位）
supabase.from('students').select('name')  // 應該是 chinese_name

// ❌ 不要用 class_name 查學生班級（實際欄位是 grade）
supabase.from('students').select('class_name')
```

---

## 三、各頁面主要查詢表格

| 頁面路由 | 主要使用的表 |
|---------|------------|
| `/` | users, role_configs |
| `/dashboard` | pick_up_queue, students |
| `/pickup` | pickup_requests, students, users |
| `/students` | students, users |
| `/my-child` | students, contact_books, exam_results |
| `/grades` | students, exam_results |
| `/leave` | students, leave_requests, users |
| `/schedule` | users, teacher_assignments, schedule_slots |
| `/contact-book` | students, contact_books |
| `/chat` | users, messages |
| `/announcements` | announcements, users |
| `/manager` | users, students, exam_results, leave_requests |
| `/staff` | users, classes |
| `/admin` | users, students, role_configs |

---

## 四、修正記錄

| 日期 | 修正內容 | 影響檔案 |
|------|---------|---------|
| 2026-04-17 | `full_name` → `name`（users 表統一）| schedule/page.tsx, manager/page.tsx |
| 2026-04-17 | `profiles` 表 → `users` 表（廢棄 profiles）| register/page.tsx, onboarding/page.tsx, lib/logService.ts |
| 2026-04-17 | `students(name)` → `students(chinese_name)` | dashboard/page.tsx |
| 2026-04-17 | 新增排課系統相關表格 | supabase/schema.sql |
