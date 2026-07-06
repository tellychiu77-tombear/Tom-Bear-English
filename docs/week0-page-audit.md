# Week 0 Page Audit — 21 個 Route 自動走查

> **執行時間**：2026-05-08
> **執行方式**：透過 Claude in Chrome 自動巡覽 production 部署（https://tom-bear-english.vercel.app）
> **登入身分**：TELLY / 總園長（director，最高權限 — 可存取所有頁面）
> **執行者**：Claude（唯讀瀏覽，無任何寫入動作）
> **配套文件**：[`week0-schema-audit.md`](./week0-schema-audit.md)、[`week0-tech-decisions.md`](./week0-tech-decisions.md)

> ⚠️ 本報告只記錄「頁面狀態」，不含任何學生/家長個資（遵守授權原則紅線 3）。

---

## 0. 執行摘要

| 指標 | 結果 |
|------|------|
| 走查 route 總數 | 22（含首頁） |
| 完全正常（✅） | 19 |
| 有問題待修（⚠️） | 3 |
| 崩潰 / 白畫面（❌） | **0** |

**好消息**：22 個 route **全部都能 render，沒有任何一頁崩潰、白畫面或 500 error**。雛形的完成度比預期高。

**待修的 3 個問題**：1 個 Major（戰情室數據沒接上）、1 個 Major（人事頁面重複 + 資料源不一致）、1 個 Minor（密碼重設無 timeout）。

---

## 1. 逐頁狀態表

| # | Route | 狀態 | 頁面標題 | 觀察 |
|---|-------|------|---------|------|
| 1 | `/` | ✅ | 湯貝爾首頁 | 13 個模組卡片齊全，總園長視角，待辦事項計數正常 |
| 2 | `/login` | ✅ | 補習班管理系統 | 登入表單（email + 密碼 + 忘記密碼） |
| 3 | `/register` | ✅ | 註冊申請 | 家長/老師切換、孩子綁定欄位、班級下拉 |
| 4 | `/onboarding` | ✅ | 歡迎！請選擇身分 | 3 步驟引導 wizard |
| 5 | `/reset-password` | ⚠️ | 驗證連結中 | 無 token 時永久顯示「驗證連結中」，見問題 P3 |
| 6 | `/dashboard` | ✅ | 接送管理儀表板 | 正常 render，0 筆等待（資料表空） |
| 7 | `/pickup` | ✅ | 接送管理中心 | 正常 render，含即時連線 + 廣播功能，0 人等待 |
| 8 | `/students` | ✅ | 學生資料庫 | 152 位學生載入正常，班級篩選 + 表格 + 操作按鈕 |
| 9 | `/contact-book` | ✅ | 班級大廳 | 12 個班級卡片含人數，UI 正常（記錄資料表空） |
| 10 | `/my-child` | ✅ | （家長頁） | 顯示「尚未連結學生資料」— 對總園長身分是正確行為 |
| 11 | `/leave` | ✅ | 請假管理中心 | 96 筆真實資料、11 筆待審，核准/駁回按鈕齊全 |
| 12 | `/grades` | ✅ | 成績管理系統 | 3 個 tab（登錄/歷史/分析）、班級下拉 |
| 13 | `/attendance` | ✅ | 出缺席點名 | 班級 + 日期選擇器，請假自動標記說明 |
| 14 | `/progress` | ✅ | 課程進度追蹤 | 正常 render，0 筆記錄（資料表空） |
| 15 | `/payment` | ✅ | 繳費紀錄 | 真實繳費資料載入正常，篩選 + 批次新增 |
| 16 | `/chat` | ✅ | 親師對話 | 5 位聯絡人，教師版視角 |
| 17 | `/announcements` | ✅ | 園所公告 | 2 則公告（內容為測試垃圾資料，見問題 P4） |
| 18 | `/schedule` | ✅ | 排課系統 | 4 位老師、學期切換、週課表 |
| 19 | `/manager` | ⚠️ | 部門戰情室 | render 正常但「平均成績 0 分／及格率 0%」，見問題 P1 |
| 20 | `/admin` | ✅ | 人事管理系統 | 13 員工 + 5 家長 + 5 待審 |
| 21 | `/admin/logs` | ✅ | 系統監控日誌 | 月曆檢視 + 操作統計 |
| 22 | `/staff` | ⚠️ | 人事與班級管理 | 與 /admin 功能重複，且班級名稱不一致，見問題 P2 |

---

## 2. 待修問題（依嚴重度排序）

### 🔴 P1（Major）：`/manager` 戰情室數據沒接上

**現象**：部門戰情室顯示「平均成績 0 分」「及格率 0%」「需關注學生 0 人」，但資料庫裡 `exam_results` 表實際有 **924 筆**成績資料。

**推測原因**（待 Phase B 確認）：
- 戰情室的成績統計可能讀的是 `grades` 表（schema audit 顯示 0 rows），而不是真正有資料的 `exam_results` 表
- 對照 schema audit 第 3 節：`grades` 與 `exam_results` 是重複表，`grades` 是 dead

**影響**：管理層儀表板是 BLUEPRINT 列的核心模組，但目前對老闆/主管沒有實際數據價值。

**Phase B 處理**：把 manager 的成績相關查詢改指向 `exam_results`。

### 🔴 P2（Major）：`/staff` 與 `/admin` 重複 + 班級資料源不一致

**現象**：
- `/staff`（舊人事頁）與 `/admin`（新人事頁）功能高度重疊
- 更嚴重的是：`/staff` 顯示的班級名稱是「快樂小班 / 資優大班 / 陽光中班」，但全系統其他頁面（students, grades, attendance, schedule...）都用「CEI-A / CEI-B / CEI-C...」命名

**推測原因**：`/staff` 讀的是 schema audit 發現的那張 dead `classes` 表（3 cols, 0 rows... 但顯示有資料？需 Phase B 細查），其他頁面用的是 `class_group` 文字欄位。

**影響**：班級命名兩套系統，是資料模型分歧的徵兆。

**Phase B 處理**：
1. 決定 `/staff` 是否 deprecate（保留 `/admin` 即可）
2. 統一班級命名的資料源

### 🟡 P3（Minor）：`/reset-password` 無 token 時永久 loading

**現象**：直接開 `/reset-password`（沒有信件 token）會永久顯示「驗證連結中，請稍候…」，雖然有「超過 10 秒請重新點信件連結」的提示文字，但沒有真正的 timeout 後 fallback 畫面。

**影響**：低（正常使用者是從信件點進來的，會帶 token）。

**Phase B 處理**：加一個 10 秒 timeout → 顯示「連結無效，請重新申請」+ 返回登入按鈕。

### 🟡 P4（Minor）：`/announcements` 有測試垃圾資料

**現象**：2 則公告內容是「jhkj」「hihiuhiuh」這類測試亂打的字。

**影響**：低，但封測前要清掉。

**Phase B 處理**：清除測試公告（這要寫入操作，會等 Telly 確認後再做）。

---

## 3. 跨頁面觀察（不是 bug，但 Phase A/B 要知道）

### 3.1 多個模組「UI 完整但 0 資料」

`/dashboard`、`/pickup`、`/contact-book`、`/progress` 都正常 render，但沒有任何記錄。對照 schema audit：

- 這些對應的表（pick_up_queue, pickups, contact_books, course_sessions）都是 0 rows
- 印證 Telly 說的「老師有用但只看介面、沒實際操作」

**意義**：這 4 個模組 Phase C 封測時要重點觀察「老師為什麼不填」。

### 3.2 學生幾乎都「未綁定」家長

`/students` 顯示 152 位學生大多標「❌ 未綁定」。對照 schema audit：`parent_student_link` 表 0 rows、`student_link_requests` 表 0 rows。

**意義**：家長端功能（/my-child、家長視角的 /chat、/payment）目前實質上沒有真實家長在用。Phase C 封測要把「家長綁定流程」當成第一個要驗證的環節。

### 3.3 真實有在用的模組（有資料佐證）

- `/students` — 152 學生
- `/leave` — 96 請假紀錄
- `/payment` — 真實繳費紀錄
- `/grades` 背後的 `exam_results` — 924 筆成績
- `/schedule` — 33 個排課 slot
- `/admin` — 23 個帳號

這些是「真的有人在用」的核心。Phase C 封測時這些是基準。

---

## 4. 對 Phase B 的輸入

Phase B（封測前修整，原訂第 4-5 週）的 bug 清單初稿：

| 優先 | 項目 | 來源 |
|------|------|------|
| Blocker | 無（沒有頁面崩潰） | — |
| Major | P1: manager 戰情室成績數據修正 | 本報告 |
| Major | P2: /staff 重複頁面處理 + 班級命名統一 | 本報告 |
| Major | （schema）profiles/users 雙軌、6 張型態錯誤表 | schema audit |
| Minor | P3: reset-password timeout | 本報告 |
| Minor | P4: 清測試公告 | 本報告 |
| Minor | 家長綁定流程驗證 | 本報告 §3.2 |

---

## 5. 走查方式備註

- 全程唯讀瀏覽，無任何寫入、無點擊「刪除/送出」類按鈕
- 走查在 production 環境進行（因為沒有 staging）— 但只是「看」，不影響任何資料
- 每頁透過 JS 探測 readyState + 內文 + 錯誤關鍵字，未截圖（文字探測已足夠判斷狀態）

---

## 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 建立（22 route 第一次完整走查） | Claude（透過 Telly 已登入 browser） |

---

**文件結束**
