# 湯貝爾 APP — 完整專案規劃版圖

> 文件生成日期：2026-05-08  
> 版本：v1.0  
> 技術棧：Next.js 14 · TypeScript · Tailwind CSS · Supabase

---

## 目錄

1. [專案概覽](#1-專案概覽)
2. [技術架構](#2-技術架構)
3. [角色與權限系統](#3-角色與權限系統)
4. [資料庫 Schema](#4-資料庫-schema)
5. [頁面地圖 & 設計規格](#5-頁面地圖--設計規格)
6. [函式庫與共用元件](#6-函式庫與共用元件)
7. [Migration 歷程](#7-migration-歷程)
8. [命名規範摘要](#8-命名規範摘要)

---

## 1. 專案概覽

**湯貝爾 APP** 是一套專為英文補習班設計的全端管理系統，涵蓋：

- 家長接送呼叫 (Mom Call)
- 老師聯絡簿工作台
- 學生檔案管理
- 請假 / 出缺席管理
- 成績與課程進度追蹤
- 繳費紀錄
- 親師對話聊天室
- 行政 / 人事管理
- 排課系統
- 部門戰情室 (管理層數據儀表板)

**專案名稱：** `mom-call-app`  
**GitHub Repo：** `tellychiu77-tombear/Tom-Bear-English`  
**主要分支：** `main`  
**Supabase 專案 ID：** `peuftkzxuxvdtixhudda`

---

## 2. 技術架構

### 前端

| 項目 | 技術 |
|------|------|
| 框架 | Next.js 14.2 (App Router) |
| 語言 | TypeScript |
| 樣式 | Tailwind CSS |
| 圖示 | Lucide React 0.378 |
| 圖表 | Recharts 3.8 |
| 工具 | clsx, tailwind-merge |

### 後端 / 資料庫

| 項目 | 技術 |
|------|------|
| BaaS | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Email/Password) |
| 即時同步 | Supabase Realtime (postgres_changes) |
| 儲存 | Supabase Storage (照片上傳) |

### 目錄結構

```
mom-call-app/
├── app/
│   ├── page.tsx                  # 首頁 / 登入
│   ├── layout.tsx                # 全域 Layout
│   ├── register/page.tsx         # 用戶註冊
│   ├── onboarding/page.tsx       # 新用戶引導
│   ├── reset-password/page.tsx   # 密碼重設
│   ├── dashboard/page.tsx        # 接送戰情室（老師端）
│   ├── pickup/page.tsx           # 接送系統（家長端）
│   ├── students/page.tsx         # 學生管理
│   ├── contact-book/page.tsx     # 聯絡簿工作台
│   ├── my-child/page.tsx         # 我的孩子（家長端）
│   ├── leave/page.tsx            # 請假中心
│   ├── grades/page.tsx           # 成績管理
│   ├── attendance/page.tsx       # 出缺席點名
│   ├── progress/page.tsx         # 課程進度追蹤
│   ├── payment/page.tsx          # 繳費紀錄
│   ├── chat/page.tsx             # 親師對話聊天室
│   ├── announcements/page.tsx    # 公告管理
│   ├── schedule/page.tsx         # 排課管理
│   ├── manager/page.tsx          # 部門戰情室
│   ├── staff/page.tsx            # 人事管理 (舊)
│   ├── admin/page.tsx            # 人事管理（新）
│   └── admin/logs/page.tsx       # 操作日誌
├── lib/
│   ├── supabaseClient.ts         # Supabase 客戶端初始化
│   ├── permissions.ts            # 三層權限系統
│   ├── usePermissions.ts         # 權限 Hook
│   ├── logService.ts             # 操作日誌服務
│   └── useToast.ts               # Toast 通知 Hook
└── supabase/
    ├── schema.sql                # 主資料庫結構
    ├── add_attendance.sql        # 出缺席 Migration
    ├── add_payment_records.sql   # 繳費 Migration
    ├── migration_permissions.sql # 權限系統 Migration
    ├── migration_schedule.sql    # 排課系統 Migration
    └── migrations/
        └── add_course_progress.sql
```

---

## 3. 角色與權限系統

### 角色清單（8 種）

| role 值 | 中文名稱 | 說明 |
|---------|----------|------|
| `director` | 總園長 | 最高管理，全部權限 |
| `english_director` | 英文部主任 | 英文部管理，全部權限 |
| `care_director` | 安親部主任 | 安親部管理，全部權限 |
| `admin` | 行政人員 | 行政事務，大部分唯讀 |
| `admin_staff` | 行政助理 | 受限行政，部分功能 |
| `teacher` | 老師 | 只看自己班的學生 |
| `manager` | 管理員 | 系統管理員，全部權限 |
| `parent` | 家長 | 只看自己孩子，有限功能 |

> `pending`：剛註冊、待審核的臨時狀態，等同家長權限

### 14 項權限 Key

| 權限 Key | 說明 | 圖示 |
|----------|------|------|
| `manageAnnouncements` | 發布/編輯公告 | 📢 |
| `viewAllStudents` | 查看全部學生 | 👥 |
| `editStudents` | 編輯學生資料 | ✏️ |
| `approveLeave` | 審核請假 | 📅 |
| `viewGrades` | 查看成績 | 📊 |
| `editGrades` | 登錄成績 | 📝 |
| `fillContactBook` | 填寫聯絡簿 | 📒 |
| `viewPickupQueue` | 接送戰情室 | 🚌 |
| `viewManagerDashboard` | 部門戰情室 | 💼 |
| `manageUsers` | 人事管理 | 👤 |
| `chatWithParents` | 親師對話 | 💬 |
| `viewAttendance` | 出缺席點名 | 📋 |
| `viewProgress` | 課程進度追蹤 | 📖 |
| `viewPayments` | 繳費紀錄 | 💰 |

### 各角色預設權限矩陣

| 權限 | director | english_director | care_director | admin | admin_staff | teacher | manager | parent |
|------|:--------:|:----------------:|:-------------:|:-----:|:-----------:|:-------:|:-------:|:------:|
| manageAnnouncements | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| viewAllStudents | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| editStudents | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| approveLeave | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| viewGrades | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| editGrades | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| fillContactBook | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| viewPickupQueue | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| viewManagerDashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| manageUsers | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| chatWithParents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| viewAttendance | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| viewProgress | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| viewPayments | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |

### 三層權限架構

```
優先級（高 → 低）：
  Layer 3: users.extra_permissions  → 個人覆蓋（null=沿用, true=強制開, false=強制關）
  Layer 2: role_configs (DB)        → 總園長可在後台調整的職位預設
  Layer 1: HARDCODED_DEFAULTS       → 程式碼內建備用值
```

---

## 4. 資料庫 Schema

### 核心表格一覽

| 表格名稱 | 說明 | 主要欄位 |
|----------|------|----------|
| `users` | 用戶資料（連結 auth.users） | id, role, name, email, is_approved, extra_permissions, teacher_type, available_days |
| `students` | 學生資料 | id, parent_id, chinese_name, english_name, birthday, school_grade, grade (英文班), allergies, pickup_method, parent_phone |
| `pick_up_queue` | 舊版接送隊列 | id, student_id, status |
| `pickup_requests` | 新版接送請求 | id, student_id, status, notified |
| `contact_books` | 聯絡簿記錄 | id, student_id, date, mood, focus, participation, expression, lesson_topic, homework, note, public_note, is_absent, parent_signature |
| `messages` / `chat_messages` | 聊天訊息 | id, sender_id, receiver_id, content, created_at |
| `exam_results` | 成績記錄 | id, student_id, exam_name, subject, score, created_at |
| `leave_requests` | 請假申請 | id, student_id, type, reason, start_date, end_date, status |
| `announcements` | 公告 | id, title, content, priority, audience, author_id |
| `announcement_reads` | 公告已讀記錄 | id, announcement_id, user_id, read_at |
| `audit_logs` | 操作日誌 | id, action, details, user_id, user_name |
| `role_configs` | 職位預設權限表 | role (PK), permissions (jsonb) |
| `teacher_assignments` | 老師負責班級 | id, teacher_id, class_group, slot_type, role |
| `schedule_slots` | 排課時間表 | id, semester, class_group, slot_type, lead_teacher_id, assistant_teacher_id, day_of_week, start_time |
| `attendance_records` | 出缺席記錄 | id, student_id, class_group, date, status, teacher_id |
| `course_sessions` | 課程進度記錄 | id, class_group, date, topic, content, homework, homework_due, teacher_id |
| `student_progress_notes` | 學生個別進度 | id, session_id, student_id, homework_status, note |
| `payment_records` | 繳費紀錄 | id, student_id, amount, item, paid_date, payment_method, status |

### students 表詳細欄位

```sql
students (
  id                uuid  PK,
  parent_id         uuid  FK → users.id,
  chinese_name      text  NOT NULL,
  english_name      text,
  birthday          date,
  school_grade      text,          -- 國小一年級 ~ 國中九年級
  grade             text,          -- 英文班別，格式: CEI-A / CEI-A, 課後輔導
  allergies         text,
  pickup_method     text,          -- 家長自接 / 學校公車 / ...
  parent_relationship text,
  parent_phone      text,
  teacher_note      text,
  internal_tags     text[],
  profile_details   jsonb          -- 延伸欄位（英文程度、強項、待加強）
)
```

### contact_books 表詳細欄位

```sql
contact_books (
  id               uuid  PK,
  student_id       uuid  FK → students.id,
  date             date,
  mood             int   1-5,   -- 心情
  focus            int   1-5,   -- 專注度
  participation    int   1-5,   -- 參與度
  expression       int   1-5,   -- 英文表達力
  lesson_topic     text,        -- 今日教學主題
  homework         text,        -- 作業
  note             text,        -- 老師內部備註
  public_note      text,        -- 給家長的留言
  photos           text[],      -- 圖片 URL 陣列
  is_absent        boolean,
  parent_signature text         -- 家長簽名確認
)
```

### leave_requests 表

```sql
leave_requests (
  id          uuid  PK,
  student_id  uuid  FK → students.id,
  type        text,    -- 病假, 事假, 其他
  reason      text,
  start_date  date  NOT NULL,
  end_date    date  NOT NULL,
  status      text  CHECK ('pending','approved','rejected')
)
```

### 班別格式規範

```
純英文課：         CEI-A
英文 + 課後輔導：  CEI-A, 課後輔導
純課後輔導：       課後輔導
無班別：           NULL
```

---

## 5. 頁面地圖 & 設計規格

### 頁面總覽

| # | 路由 | 檔案 | 功能簡述 | 可存取角色 |
|---|------|------|----------|-----------|
| 1 | `/` | `app/page.tsx` | 首頁 / 登入 / 功能導航 | 全部 |
| 2 | `/register` | `app/register/page.tsx` | 帳號註冊 | 未登入 |
| 3 | `/onboarding` | `app/onboarding/page.tsx` | 新用戶引導（角色選擇） | 已登入待設定 |
| 4 | `/reset-password` | `app/reset-password/page.tsx` | 密碼重設 | 未登入 |
| 5 | `/dashboard` | `app/dashboard/page.tsx` | 接送戰情室（老師/管理端） | teacher, admin, director |
| 6 | `/pickup` | `app/pickup/page.tsx` | 接送叫號（家長端） | parent |
| 7 | `/students` | `app/students/page.tsx` | 學生檔案管理 | teacher(班), admin, director |
| 8 | `/contact-book` | `app/contact-book/page.tsx` | 聯絡簿工作台 | teacher(fillContactBook) |
| 9 | `/my-child` | `app/my-child/page.tsx` | 我的孩子（家長檢視） | parent |
| 10 | `/leave` | `app/leave/page.tsx` | 請假中心 | all |
| 11 | `/grades` | `app/grades/page.tsx` | 成績管理 | teacher(editGrades), all(viewGrades) |
| 12 | `/attendance` | `app/attendance/page.tsx` | 出缺席點名 | teacher, admin, director |
| 13 | `/progress` | `app/progress/page.tsx` | 課程進度追蹤 | teacher, parent(只看) |
| 14 | `/payment` | `app/payment/page.tsx` | 繳費紀錄 | admin, director, parent(只看) |
| 15 | `/chat` | `app/chat/page.tsx` | 親師對話聊天室 | all(chatWithParents) |
| 16 | `/announcements` | `app/announcements/page.tsx` | 公告管理 | all（管理才能新增） |
| 17 | `/schedule` | `app/schedule/page.tsx` | 排課管理 | director, admin |
| 18 | `/manager` | `app/manager/page.tsx` | 部門戰情室 | viewManagerDashboard |
| 19 | `/admin` | `app/admin/page.tsx` | 人事管理 | manageUsers |
| 20 | `/admin/logs` | `app/admin/logs/page.tsx` | 操作日誌 | director, manager |

---

### 頁面 1：首頁 / 登入 (`/`)

**檔案：** `app/page.tsx`

**功能：**
- 未登入：顯示登入表單（Email + Password）
- 忘記密碼：行內展開輸入框 → 發送重設信
- 登入成功後：根據角色顯示功能導航 + 計數器 badge
- 待審核（pending）：顯示等待審核畫面 + 審核角色提示

**主要狀態：**
```typescript
role, loading, userName, jobTitle
loginError, loginLoading
showForgotPw, forgotEmail, forgotSent
pendingRole  // 'parent' | 'teacher' | null
counts       // { pickup, leaves, unreadChats }
pendingCounts // { users, bindings }
permissions  // PermissionsMap
```

**功能導覽模組（依角色顯示）：**

| 模組 | 顯示條件 |
|------|---------|
| 🚌 接送戰情室 | viewPickupQueue |
| 📒 聯絡簿 | fillContactBook |
| 👥 學生管理 | viewAllStudents |
| 📅 請假中心 | 全員 |
| 📊 成績管理 | viewGrades |
| 📋 出缺席 | viewAttendance |
| 📖 課程進度 | viewProgress |
| 💰 繳費紀錄 | viewPayments |
| 💬 親師對話 | chatWithParents |
| 📢 公告管理 | 全員 |
| 🗓️ 排課系統 | director/admin |
| 💼 戰情室 | viewManagerDashboard |
| 👤 人事管理 | manageUsers |

**即時監聽：** chat_messages INSERT, leave_requests *, pickup_requests *, users UPDATE/INSERT

---

### 頁面 2：用戶註冊 (`/register`)

**檔案：** `app/register/page.tsx`

**功能：**
- Email + 密碼 + 確認密碼 表單
- 密碼強度提示
- 註冊後自動導向 `/onboarding`
- 錯誤訊息全部中文化

**DB 操作：** `supabase.auth.signUp()` → 自動在 `users` 表新增 pending 記錄

---

### 頁面 3：新用戶引導 (`/onboarding`)

**檔案：** `app/onboarding/page.tsx`

**功能：**
- 用戶填寫基本資料（姓名、角色選擇）
- 若選擇家長：輸入孩子姓名 → 系統嘗試比對 students 表 → 自動申請綁定
- 儲存到 `users` 表
- 完成後導向首頁

**家長綁定邏輯：**
1. 查詢 `students` 表比對孩子姓名
2. 若找到 → 建立 `parent_binding_requests` 記錄（待管理員審核）
3. 審核通過 → `students.parent_id` 更新

---

### 頁面 4：密碼重設 (`/reset-password`)

**檔案：** `app/reset-password/page.tsx`

**功能：**
- 接收 Supabase 重設信中的 token
- 輸入新密碼 + 確認
- 更新成功後導向首頁

---

### 頁面 5：接送戰情室 (`/dashboard`) — 老師端

**檔案：** `app/dashboard/page.tsx`

**可存取角色：** teacher, admin, director, english_director, care_director

**功能：**
- 顯示「待接送」隊列（按時間升序）
- 點擊「已完成」→ 更新狀態
- Supabase Realtime 即時更新

**DB 表格：** `pick_up_queue` (JOIN students.chinese_name)

**狀態枚舉：** `pending → arrived → completed`

---

### 頁面 6：接送叫號 (`/pickup`) — 家長端

**檔案：** `app/pickup/page.tsx`

**可存取角色：** parent（以及有 viewPickupQueue 的員工）

**家長端功能：**
- 顯示綁定的孩子列表
- 點擊「我到了！」→ 在 `pickup_requests` 插入記錄
- 實時顯示排隊狀態

**老師端功能（同頁）：**
- 顯示排隊清單
- 語音廣播 (Web Speech API)：「XXX，家長接送。」
- 點擊「已接走」→ 更新記錄狀態

**DB 表格：** `pickup_requests` (Realtime)

---

### 頁面 7：學生管理 (`/students`)

**檔案：** `app/students/page.tsx`

**可存取角色：**
- teacher → 只看自己負責班級的學生（`teacher_assignments`）
- 無班級老師 → 顯示「🏫 尚未被分配班級」友善提示畫面
- english_director, admin, director → 全部學生

**功能：**
- 學生列表（分頁，每頁 30 筆）+ 班別篩選
- 點擊學生 → 開啟 3-Tab Profile Modal

**Profile Modal 三個 Tab：**

| Tab | 內容 |
|-----|------|
| 基本資料 | 中英文姓名、生日、學校年級、英文班別、接送方式、過敏、家長聯絡 |
| 學習檔案 | 英文程度（LEVEL_OPTIONS）、強項標籤（STRENGTH_TAGS × 12）、待加強標籤（IMPROVEMENT_TAGS × 12）、老師備註 |
| 學習分析 | 90天出缺席率、每週專注/參與/表達趨勢折線圖、風險旗幟、最近 10 筆記錄 |

**新增學生 Modal（有 editStudents 權限才顯示）：**
- 中文姓名（必填）、英文姓名、生日、學校年級、英文班別、課後輔導選項
- 家長 Email 綁定（選填）、親子關係、家長電話

**狀態：**
```typescript
students, loading, filterClass, canEditStudents
currentPage (PAGE_SIZE = 30)
isTeacherView, teacherClasses, noClassTeacher
profileStudent, profileTab
addModalOpen
```

**DB 表格：** students, teacher_assignments, contact_books (analytics), users

---

### 頁面 8：聯絡簿工作台 (`/contact-book`)

**檔案：** `app/contact-book/page.tsx`

**可存取角色：** teacher (fillContactBook)

**三欄版型（桌面）：**
- 左欄：學生列表 + 班級篩選 + 日期選擇器
- 中欄：目前選中學生的聯絡簿填寫表單
- 右欄：月曆統計（月份概覽，已填/未填/缺席）

**填寫欄位（每位學生）：**
- 心情 / 專注度 / 參與度 / 表達力（各 1-5 星評分）
- 課程主題 (lesson_topic)
- 作業 (homework)
- 老師內部備註 (note)
- 給家長的留言 (public_note)
- 照片上傳（Supabase Storage）
- 請假標記 (is_absent)
- 家長簽名顯示

**廣播功能（Broadcast）：**
- 一鍵填寫相同的課程主題 / 作業 / 公告給整班

**DB 表格：** contact_books, students (JOIN teacher_assignments)

---

### 頁面 9：我的孩子 (`/my-child`) — 家長端

**檔案：** `app/my-child/page.tsx`

**可存取角色：** parent

**功能（3 個 Tab）：**

| Tab | 說明 |
|-----|------|
| 個人資料 | 孩子基本資料（唯讀，admin 才能改） |
| 學習表現 | 近期聯絡簿記錄、心情/專注度圖表（Recharts LineChart） |
| 成績查詢 | 歷次考試成績列表 |

**DB 表格：** students, contact_books, exam_results

---

### 頁面 10：請假中心 (`/leave`)

**檔案：** `app/leave/page.tsx`

**可存取角色：** 全員（行為依角色不同）

**家長視角：**
- 新增請假申請（選擇孩子、假別、日期、原因）
- 查看自己孩子的歷史請假記錄
- 狀態：待審核 / 已核准 / 已拒絕

**員工視角（有 approveLeave 權限）：**
- 查看所有待審假單
- 一鍵核准 / 拒絕

**假別選項：** 病假, 事假, 其他

**狀態 Tab：** 待處理 | 歷史記錄

**DB 表格：** leave_requests, leave_requests_view (VIEW), students, users

---

### 頁面 11：成績管理 (`/grades`)

**檔案：** `app/grades/page.tsx`

**可存取角色：**
- 查看：viewGrades（所有員工）
- 編輯：editGrades（teacher, director 等）

**功能：**
- 學生成績列表（可依班別、科目篩選）
- 新增考試紀錄（考試名稱、科目、學生、分數）
- 成績分布圓形圖（Recharts）
- 個別學生歷次折線圖
- 成績色碼：A(90+) 綠、B(80+) 藍、C(70+) 紫、D(60+) 黃、F 紅

**DB 表格：** exam_results, students

---

### 頁面 12：出缺席點名 (`/attendance`)

**檔案：** `app/attendance/page.tsx`

**可存取角色：** teacher (viewAttendance), admin, director

**功能：**
- 選擇日期 + 班級 → 載入該班學生
- 逐一標記：出席 / 遲到 / 缺席 / 已請假
- 自動比對 leave_requests（核准的假 → 自動標記「已請假」）
- 一鍵全班出席
- 儲存後更新 attendance_records

**狀態顏色：**
- 出席 ✅ 綠色
- 遲到 ⏰ 琥珀色
- 缺席 ❌ 紅色
- 已請假 📋 黃色

**DB 表格：** attendance_records, students, leave_requests, teacher_assignments

---

### 頁面 13：課程進度追蹤 (`/progress`)

**檔案：** `app/progress/page.tsx`

**可存取角色：**
- 老師：新增課程記錄、填寫個別學生作業狀態
- 家長：只看自己孩子所在班的記錄

**功能：**
- 課程記錄列表（依日期降序）
- 新增課程記錄（班別、日期、主題、教學內容、作業、截止日）
- 展開單筆記錄 → 顯示所有學生作業狀態
- 狀態：已完成（綠）/ 未完成（紅）/ 待確認（灰）

**DB 表格：** course_sessions, student_progress_notes, students

---

### 頁面 14：繳費紀錄 (`/payment`)

**檔案：** `app/payment/page.tsx`

**可存取角色：**
- 管理員（director, admin, english_director, care_director, manager）：新增/管理
- 家長：查看自己孩子的繳費狀態

**功能：**
- 繳費紀錄列表（可篩選學生、狀態）
- 統計卡片：總金額、已繳清、待繳金額
- 新增記錄（學生、金額、項目、繳費日、方式、狀態）
- 狀態：已繳清（綠）/ 待繳（黃）/ 部分繳清（橘）

**費用項目：** 學費, 材料費, 活動費, 其他

**繳費方式：** 現金, 銀行轉帳, 其他

**DB 表格：** payment_records, students

---

### 頁面 15：親師對話聊天室 (`/chat`)

**檔案：** `app/chat/page.tsx`

**可存取角色：** all（chatWithParents 或 parent）

**功能：**
- 聯絡人列表（左欄）
- 對話訊息（右欄）
- 即時訊息接收（Supabase Realtime）
- 相對時間格式（剛剛、3分、2時、昨天、N天前）
- 用戶 Avatar（以名字首字彩色圓形）

**DB 表格：** chat_messages (或 messages), users

---

### 頁面 16：公告管理 (`/announcements`)

**檔案：** `app/announcements/page.tsx`

**可存取角色：**
- 查看：全員
- 新增/編輯/刪除：manageAnnouncements

**功能：**
- 公告列表（依時間降序）+ 搜尋
- 分類 Tab：全部、全員公告、家長專屬、教師內部
- 已讀/未讀追蹤（announcement_reads）
- 置頂公告（is_pinned）
- 緊急 / 一般 優先級標籤

**受眾類型：** all（全員公告）, parent（家長專屬）, teacher（教師內部）

**DB 表格：** announcements, announcement_reads, users

---

### 頁面 17：排課管理 (`/schedule`)

**檔案：** `app/schedule/page.tsx`

**可存取角色：** director, english_director, admin（排課相關）

**功能（三大區塊）：**

**A. 老師管理：**
- 列出所有 teacher 角色用戶
- 顯示老師類型（外師 🌍 / 外聘 📝 / 正職 👩‍🏫）
- 顯示可來天數（週一～週五 badge）

**B. 老師任務分配（teacher_assignments）：**
- 指定老師負責哪個班、哪類課程、主責/助教

**C. 排課時間表（schedule_slots）：**
- 週曆格式顯示（週一～週五）
- 每格顯示：班別、課程類型、主責老師、助教
- 新增排程：選學期、班別、課程類型、星期、時間

**課程類型 (slot_type)：** 聽說, 文法, 閱讀, 英文綜合, 課後輔導

**老師類型 (teacher_type)：** foreign（外師）, external（外聘）, staff（正職）

**DB 表格：** users, teacher_assignments, schedule_slots

---

### 頁面 18：部門戰情室 (`/manager`)

**檔案：** `app/manager/page.tsx`

**可存取角色：** viewManagerDashboard（director, admin, manager 等）

**功能（5 個 Tab）：**

| Tab | 內容 |
|-----|------|
| 📊 總覽 | 學生總數、本週出席率、新生/流失、繳費收入統計卡片 |
| 🏫 班級分析 | 各班人數長條圖、出席率比較 |
| 🧑‍🏫 師資效能 | 每位老師負責班級數、聯絡簿填寫率 |
| 📅 出勤分析 | 本週/月出缺席折線圖（Recharts LineChart） |
| 📈 留存趨勢 | 學生人數歷史趨勢（BarChart） |

**篩選條件：**
- 部門：全校 / 英文部 / 安親部 / 行政部
- 時間範圍：本週 / 本月 / 本學期 / 全部

**DB 表格：** students, attendance_records, contact_books, payment_records, users

---

### 頁面 19：人事管理 (`/admin`)

**檔案：** `app/admin/page.tsx`

**可存取角色：** manageUsers（director, admin, manager）

**功能（2 個主 Tab）：**

**A. 用戶管理 Tab（3 個子 Tab）：**

| 子 Tab | 說明 |
|--------|------|
| 員工/老師 | 所有非家長用戶，可編輯角色/職稱/權限 |
| 家長 | 所有家長帳號，可查看綁定學生 |
| 待審核 | 新申請用戶 + 家長綁定申請，一鍵核准/拒絕 |

**B. 職位權限設定 Tab：**
- 可調整 admin / teacher / english_director / care_director 的預設權限
- 即時更新 role_configs 表

**用戶編輯 Modal 欄位：**
- 姓名、角色（role）、職稱（job_title）、是否核准（is_approved）
- 老師專屬：老師類型（teacher_type）、可來天數（available_days）
- 14 項個人權限覆蓋（extra_permissions）

**DB 表格：** users, role_configs, parent_binding_requests

---

### 頁面 20：操作日誌 (`/admin/logs`)

**檔案：** `app/admin/logs/page.tsx`

**可存取角色：** director, manager

**功能：**
- 列出所有 audit_logs
- 顯示：操作時間、操作者姓名、動作、詳情
- 可依用戶/動作類型篩選

**DB 表格：** audit_logs

---

## 6. 函式庫與共用元件

### `lib/supabaseClient.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
```

### `lib/permissions.ts`

三層權限計算引擎（詳見第 3 節）。主要匯出：
- `getEffectivePermissions(role, roleConfig, extraPermissions)` → PermissionsMap
- `can(perm, role, roleConfig, extraPermissions)` → boolean
- `isStaff(role)` → boolean
- `PERMISSION_META` → 14 個 key 的 label + icon
- `JOB_TITLE_PRESETS` → 各角色職稱建議選項
- `HARDCODED_DEFAULTS` → 程式碼內建備用權限

### `lib/usePermissions.ts`

React Hook：自動從 Supabase 讀取當前用戶的有效權限。

```typescript
const { permissions, loading, user } = usePermissions();
```

### `lib/logService.ts`

操作日誌服務：

```typescript
await logAction(userId, userName, action, details);
// 寫入 audit_logs 表
```

### `lib/useToast.ts`

Toast 通知 Hook：

```typescript
const { toast, showToast } = useToast();
showToast('儲存成功！', 'success');
showToast('發生錯誤', 'error');
```

---

## 7. Migration 歷程

| 順序 | 檔案 | 說明 |
|------|------|------|
| 1 | `schema.sql` | 基礎資料表（users, students, pick_up_queue, contact_books, messages, exam_results, leave_requests, announcements, audit_logs, role_configs） |
| 2 | `migration_permissions.sql` | 權限系統（extra_permissions, is_approved 欄位, role_configs 預設值） |
| 3 | `migration_schedule.sql` | 排課系統（teacher_assignments, schedule_slots, teacher_type, available_days） |
| 4 | `migration_parent_binding.sql` | 家長綁定申請系統 |
| 5 | `add_attendance.sql` | 出缺席記錄（attendance_records） |
| 6 | `migrations/add_course_progress.sql` | 課程進度追蹤（course_sessions, student_progress_notes） |
| 7 | `add_payment_records.sql` | 繳費紀錄（payment_records） |
| 8 | `migration_exam_results.sql` | 成績表更新 |
| 9 | `seed_students.sql` | 測試學生資料 |

**contact_books 表有重大修改：**
- 原版：標題 + 文字內容（類似公告）
- 新版：student_id + 日期 + mood/focus/participation/expression 數值評分 + 各種備註欄

---

## 8. 命名規範摘要

（完整版見 `NAMING_CONVENTION.md`）

### 資料庫欄位命名

| 類型 | 規範 | 範例 |
|------|------|------|
| 欄位 | snake_case | `chinese_name`, `start_date` |
| 外鍵 | `{table_singular}_id` | `student_id`, `teacher_id` |
| 時間 | `_at` 結尾 | `created_at`, `updated_at` |
| 日期 | `_date` 結尾 | `start_date`, `paid_date` |
| 布林 | `is_` 前綴 | `is_approved`, `is_absent` |

### 學生中文名稱欄位

- **DB 欄位：** `chinese_name`（students 表）
- **歷史問題：** 早期曾用 `name`，已全面統一為 `chinese_name`

### 請假日期欄位

- **正確：** `start_date` / `end_date`
- **已廢棄：** `leave_date`（早期版本）

---

## 9. 進行中的結構性升級（v3.0 規劃）

> 本節 2026-05-08 加入。
> 本文件（PROJECT_BLUEPRINT.md）描述系統「現況」，未來方向與升級計畫請參考策略藍圖：
>
> 👉 **[Tom_Bear_AI化優化報告_v3.0.md](./Tom_Bear_AI化優化報告_v3.0.md)**

### 進行中項目

- **Phase A（5/11-5/31）**：Multi-tenant 架構升級（加 tenants 主表、所有業務表加 tenant_id、Supabase RLS、個資合規四件事）
- **Phase B-D（6/1-8/2）**：5 模組封測前修整、自家補習班 4 週封測、為 AI 化備料
- **8/3+**：AI 化階段啟動（依屆時情況再規劃）

### 注意事項

- 本 PROJECT_BLUEPRINT.md 將在 Phase A 完成後（約 6 月初）大改一次，反映 multi-tenant 後的新 schema
- 在 Phase A 完成前，所有 schema 改動都要同時更新本文件第 4 節與 v3.0 報告第 10 章
- 任何 AI 工具讀取本 repo 時，**請先讀 v3.0 報告**作為策略指引，再讀本文件作為技術現況

---

*本文件由 Claude AI 自動掃描專案程式碼後生成，如有異動請手動更新。*

*Last updated: 2026-05-08 (v3.0 timeline reference added)*
