# Data Dictionary — operational_events 事件字典

> **目的**：為 `operational_events` 表的所有事件建立標準字典，確保整個系統用一致的命名 + 同樣的 payload 結構，產出可供研究分析的乾淨資料。
> **撰寫日期**：2026-05-08（初版骨架，Phase A 第 1 週擴充完整）
> **狀態**：v0.1 初稿 — 列出可預期的事件，欄位定義待程式碼實際接上時微調
> **規範來源**：[`../Tom_Bear_AI化優化報告_v3.0.md`](../Tom_Bear_AI化優化報告_v3.0.md) §2 原則 8、[`backend-conventions.md`](./backend-conventions.md) §6、[`week0-tech-decisions.md`](./week0-tech-decisions.md) §2

---

## 0. 設計原則摘要（與本字典直接相關）

1. **匿名先行**：寫入時就匿名化。`event_payload` 內**嚴禁**含 PII。
2. **結構化優先**：能用數值/列舉就不用 free text。
3. **行為脈絡**：每筆都帶 `prior_event_type` + `time_since_prior_ms` 讓行為序列可重建。
4. **能回答研究問題**：每個 event 設計時，要能想到「日後能用它回答什麼研究問題」。

---

## 1. event_type 命名公約

格式：`<verb>_<noun>[_<context>]`

- ✅ `open_dashboard`、`fill_observation`、`view_student_profile`、`send_message_to_parent`
- ✅ `complete_attendance`、`approve_leave_request`、`submit_grade_batch`
- ❌ `dashboardOpened`（駝峰）、`OPEN_DASHBOARD`（全大寫）、`view`（太籠統）

**動詞詞彙表**（盡量用這幾個，不亂發明）：

| Verb | 意義 |
|------|------|
| `open_*` | 打開某個 page / panel / modal |
| `view_*` | 看到某個資料 row 的詳情 |
| `start_*` | 開始某個流程（多步驟流程的第一步） |
| `fill_*` | 在某個欄位/表單輸入內容（非送出） |
| `submit_*` | 送出表單 |
| `complete_*` | 完成某個流程（多步驟流程的最後一步） |
| `trigger_*` | 觸發某個動作（按按鈕等） |
| `send_*` | 送出某個對外訊息 |
| `approve_*` / `reject_*` | 核准 / 駁回 |
| `cancel_*` | 取消某個正在進行的動作 |
| `error_*` | 發生使用者可見的錯誤 |

---

## 2. payload 共通欄位

所有 event 都會有的（在 `operational_events` 表 column 而非 payload）：

| 欄位 | 含義 |
|------|------|
| `tenant_id` | 該 tenant 的 UUID |
| `event_type` | 本字典定義的字串 |
| `user_role` | `teacher` / `parent` / `admin` / `director` / `platform_admin` |
| `user_anon_id` | HMAC(user_id, secret) — 不可逆 |
| `prior_event_type` | 上一個動作 |
| `time_since_prior_ms` | 距上一動作的毫秒數 |
| `session_id` | session 級匿名 UUID |
| `class_anon_code` | 班別匿名碼（HMAC） |
| `age_band` | `6-7` / `8-9` / `10-11` / `12-13` / `teen` |
| `created_at` | 觸發時間 |

`event_payload`（JSONB）放結構化的事件特定欄位 — 由各 event 自己定義。

---

## 3. 既有模組對應的事件清單

> 對應 v3.0 報告第 3 章的 13 個既有模組 + 第 4 章未來 AI 化模組。
> 標示 ⏳ 表示 8 月後 AI 化階段才實作的事件。

### 3.1 模組：登入 / 認證 / Onboarding

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_login_page` | 訪問 `/login` | `{}` | 登入 funnel drop-off 分析 |
| `submit_login` | 點登入按鈕 | `{success: bool, method: 'email'\|'oauth'}` | 登入失敗率 |
| `open_register_page` | 訪問 `/register` | `{}` | 註冊轉換率 |
| `submit_register` | 完成註冊 | `{role_chosen: 'parent'\|'teacher', has_child_binding: bool}` | 註冊類型分布 |
| `open_onboarding_step` | 進入 onboarding wizard | `{step: 1\|2\|3}` | onboarding drop-off 在哪一步 |
| `complete_onboarding` | 完成 onboarding | `{role: string, duration_seconds: int}` | onboarding 完成時間 |
| `open_reset_password` | 訪問 `/reset-password` | `{has_token: bool}` | 重設密碼流量 |

### 3.2 模組：接送（dashboard, pickup, pick_up_queue）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_dashboard` | 訪問 `/dashboard` | `{pending_count: int, arrived_count: int}` | 老師工作時段分析 |
| `open_pickup_center` | 訪問 `/pickup` | `{queue_length: int}` | 接送高峰時段 |
| `trigger_pickup_announce` | 點「廣播」按鈕 | `{queue_length: int}` | 廣播使用頻率 |
| `complete_pickup` | 標記某學生已接走 | `{wait_duration_seconds: int}` | 平均等待時間 |
| `parent_arrived` | 家長點「我到了」 | `{}` | 家長到場時段分布 |

### 3.3 模組：聯絡簿（contact_books）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_contact_book_lobby` | 訪問 `/contact-book` | `{class_count: int}` | 聯絡簿使用情境 |
| `open_class_contact_book` | 點某班級進去 | `{student_count_in_class: int}` | 哪些班最常被填 |
| `start_fill_observation` | 點某學生開始填 | `{}` | 老師填寫起點 |
| `fill_mood_score` | 填心情評分 | `{score: 1-5}` | 評分分布 |
| `fill_focus_score` | 填專注度 | `{score: 1-5}` | 同上 |
| `fill_participation_score` | 填參與度 | `{score: 1-5}` | 同上 |
| `fill_expression_score` | 填表達力 | `{score: 1-5}` | 同上 |
| `fill_appetite_score` | 填食慾 | `{score: 1-5}` | 幼兒園相關 |
| `fill_lesson_topic` | 填課程主題 | `{topic_length_chars: int}` | 寫的詳細程度 |
| `fill_homework` | 填作業 | `{homework_length_chars: int}` | 同上 |
| `fill_public_note` | 填給家長留言 | `{note_length_chars: int}` | 給家長的訊息量 |
| `upload_photo` | 上傳照片 | `{photo_count: int}` | 照片使用率 |
| `submit_observation` | 完整送出聯絡簿 | `{time_to_complete_seconds: int, all_scores_filled: bool, has_public_note: bool, has_photo: bool}` | **重要**：完成一篇耗時、品質指標 |
| `parent_view_observation` | 家長打開看聯絡簿 | `{days_since_filled: int}` | 家長閱讀延遲 |
| `parent_sign_observation` | 家長簽收 | `{}` | 簽收率 |
| ⏳ `ai_generate_observation` | AI 草稿生成（2026-08+） | `{model: string, tokens: int, cost_twd: decimal, latency_ms: int}` | AI 成本與品質 |
| ⏳ `teacher_edit_ai_draft` | 老師改 AI 草稿 | `{edit_distance_chars: int, kept_ratio: 0-1}` | AI 草稿被改了多少 |

### 3.4 模組：親師對話（chat / chat_messages）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_chat_list` | 訪問 `/chat` | `{contact_count: int, unread_count: int}` | 老師聯絡負荷 |
| `open_chat_thread` | 點某聯絡人進去 | `{messages_in_thread: int}` | 對話深度 |
| `send_message` | 送訊息 | `{from_role: string, message_length_chars: int}` | 訊息長度分布 |
| `view_message` | 收訊者打開讀 | `{delay_minutes_since_sent: int}` | 訊息回覆延遲 |
| ⏳ `ai_generate_reply_drafts` | AI 預生 3 草稿（2026-08+） | `{model, tokens, cost_twd}` | AI 草稿使用率 |
| ⏳ `teacher_select_draft` | 老師選了哪個草稿 | `{draft_id: 'A'\|'B'\|'C', edit_distance: int}` | 哪種草稿最常被選 |

### 3.5 模組：學生管理（students）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_student_list` | 訪問 `/students` | `{filter_class: string\|null, total_count: int}` | 老師檢視範圍 |
| `view_student_profile` | 點某學生進詳情 | `{tab: 'basic'\|'learning'\|'analytics'}` | 老師關心什麼 |
| `edit_student_field` | 改某欄位 | `{field_name: string}` | 哪些欄位最常改 |
| `add_student` | 新增學生 | `{has_parent_email: bool}` | 新生加入率 |
| `delete_student` | 刪除 | `{reason: string\|null}` | 流失原因（如有 input） |
| ⏳ `ai_generate_student_profile` | AI 學生畫像（2026-08+） | `{model, tokens, cost_twd}` | AI 畫像使用率 |

### 3.6 模組：請假（leave_requests）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_leave_center` | 訪問 `/leave` | `{pending_count: int, history_count: int}` | 請假管理負荷 |
| `submit_leave_request` | 家長送請假 | `{type: '病假'\|'事假'\|'家假'\|'其他', days: int, has_reason: bool}` | 請假類型分布 |
| `approve_leave` | 核准 | `{approval_delay_hours: int}` | 核准時效 |
| `reject_leave` | 駁回 | `{rejection_delay_hours: int}` | 駁回頻率 |

### 3.7 模組：成績（exam_results / grades 頁面）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_grade_center` | 訪問 `/grades` | `{tab: 'input'\|'history'\|'analysis'}` | 老師最常用哪個 tab |
| `submit_grade_batch` | 批次登錄 | `{class: string, exam_name: string, count: int, avg: int}` | 登錄頻率 |
| `submit_grade_single` | 單筆登錄 | `{student_anon_id, score: int}` | 單筆 vs 批次比 |
| `view_grade_analysis` | 看成績分析 | `{class: string, range: 'week'\|'month'\|'semester'}` | 老師關注時段 |
| ⏳ `ai_weakness_diagnosis` | AI 弱點診斷（2026-08+） | `{model, tokens, cost_twd}` | AI 診斷使用率 |

### 3.8 模組：出缺席（attendance_records）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_attendance_center` | 訪問 `/attendance` | `{}` | 點名使用情境 |
| `load_class_for_attendance` | 載入某班學生 | `{class: string, date: ISO date, student_count: int}` | 點名時段分布 |
| `mark_attendance` | 標記出缺席 | `{status: 'present'\|'late'\|'absent'\|'on_leave', auto_from_leave: bool}` | 出席率 |
| `complete_class_attendance` | 完成整班點名 | `{class: string, present_count: int, absent_count: int, time_to_complete_seconds: int}` | 點名耗時 |

### 3.9 模組：課程進度（progress, course_sessions）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_progress_tracker` | 訪問 `/progress` | `{class: string\|null, record_count: int}` | 進度管理頻率 |
| `add_course_session` | 新增一筆課程 | `{class: string, topic_length_chars: int, has_homework: bool}` | 課程記錄品質 |
| `mark_homework_status` | 標個別學生作業狀態 | `{status: 'completed'\|'incomplete'\|'pending'}` | 作業完成率 |

### 3.10 模組：繳費（payment_records）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_payment_center` | 訪問 `/payment` | `{filter: object, total_count: int}` | 繳費管理頻率 |
| `add_payment_record` | 新增繳費 | `{item: '學費'\|'材料費'\|'活動費'\|'其他', amount_band: 'lt_5k'\|'5k_to_20k'\|'gt_20k', method: string, status: string}` | 收費結構（不存實際金額避免敏感） |
| `mark_payment_paid` | 標記繳清 | `{}` | 收款流程 |
| `parent_view_payment` | 家長查看 | `{}` | 家長關注度 |

### 3.11 模組：公告（announcements）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_announcement_list` | 訪問 `/announcements` | `{unread_count: int, total: int}` | 公告檢視率 |
| `publish_announcement` | 發布 | `{audience: 'all'\|'parent'\|'teacher', content_length_chars: int, has_priority: bool}` | 公告主題分布 |
| `view_announcement` | 讀公告 | `{delay_hours_since_published: int}` | 閱讀延遲 |

### 3.12 模組：排課（schedule, schedule_slots）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_schedule` | 訪問 `/schedule` | `{semester: string}` | 排課使用時段 |
| `add_schedule_slot` | 新增 slot | `{class: string, slot_type: string, day_of_week: int, time: 'morning'\|'afternoon'\|'evening'}` | 排課模式 |
| `assign_teacher_to_class` | 指派老師 | `{role: 'lead'\|'assistant', class: string}` | 師資分配 |

### 3.13 模組：管理（admin, manager, admin/logs, staff）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `open_manager_dashboard` | 訪問 `/manager` | `{tab: 'overview'\|'class'\|'teacher'\|'attendance'\|'retention', filter_dept: string, filter_range: string}` | 管理層關注什麼 |
| `open_admin_panel` | 訪問 `/admin` | `{}` | 管理員工作 |
| `approve_user` | 核准新帳號 | `{role: string, approval_delay_hours: int}` | 核准效率 |
| `update_user_role` | 改某人角色 | `{from_role: string, to_role: string}` | 角色變動頻率 |
| `update_role_permissions` | 改角色權限預設 | `{role: string, permission_key: string}` | 權限調整頻率 |
| `view_audit_log` | 訪問 `/admin/logs` | `{date: ISO date}` | 稽核活動 |

### 3.14 模組：家長端（my-child）

| event_type | 觸發時機 | payload 結構化欄位 | 潛在研究問題 |
|------------|---------|------------------|------------|
| `parent_open_my_child` | 訪問 `/my-child` | `{has_linked_child: bool}` | 家長使用率 |
| `parent_view_child_tab` | 切 tab | `{tab: 'profile'\|'performance'\|'grades'}` | 家長最關心什麼 |
| `parent_submit_link_request` | 送綁定申請 | `{}` | 綁定 funnel |

---

## 4. payload 內容禁止清單（PII 防呆）

任何 `event_payload` 內**絕不可**出現的欄位：

| 欄位 | 說明 |
|------|------|
| `name`, `chinese_name`, `english_name`, `student_name`, `parent_name`, `teacher_name` | 任何姓名 |
| `email`, `phone`, `mobile`, `parent_phone` | 任何聯絡方式 |
| `address`, `birthday`, `id_card`, `ssn` | 識別資料 |
| `student_id`, `parent_id`, `teacher_id`, `user_id` | 原始 UUID（用 anon_id 代替） |
| 任何原始文字內容（聯絡簿原文、訊息原文、公告原文）| 用 `*_length_chars` 代替 |
| IP 位址（除非 hash 過） | — |

**判斷原則**：如果這個欄位可以用來回推到「哪個特定學生 / 家長 / 老師」，就**禁止寫入** event_payload。

---

## 5. 設計新 event 的 checklist

在加入新 event 前，跑過這 5 題：

1. **這個 event 捕捉什麼具體行為？**（一句話描述）
2. **payload 是否結構化？**（避免 free text）
3. **payload 是否含 PII？**（依 §4 檢查）
4. **能跟其他 event 交叉嗎？**（時間、空間、角色、序列）
5. **未來能回答什麼研究問題？**

通不過第 5 題的 event 不該加。

---

## 6. 與 backend-conventions.md §6 的對應

backend-conventions.md §6.2 提供 `recordEvent()` helper 的程式碼。本字典是「helper 怎麼用」的對照表。

範例：

```typescript
// lib/operationalEvents.ts 提供：
await recordEvent({
  tenantId, userId, userRole,
  eventType: 'submit_observation',  // ← 本字典 §3.3 定義
  payload: {
    time_to_complete_seconds: 45,
    all_scores_filled: true,
    has_public_note: true,
    has_photo: false,
  },
});
```

---

## 7. 變更管理

當需要新增 / 修改 event_type：

1. 先在本字典加條目（含名稱、觸發時機、payload、研究問題）
2. 同步更新 `lib/operationalEvents.ts` 的 TypeScript 型別
3. 在 PR description 列出新事件
4. Telly review 後合併

**不允許**：
- 程式碼有寫但本字典沒記載的 event
- 本字典定義跟實際寫入的 payload 結構不一致

---

## 8. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v0.1 草擬 — 列出 13 模組共 ~80 個 event types | Claude |

---

**文件結束**

> 本字典是「實體派觀察儀器」的目錄。當你（或未來合作夥伴）想做某類分析時，先查本字典看「現有事件能不能回答」。不能的話，先加 event 再分析。
