# 湯貝爾 APP 封測前全面掃描報告（2026-07-02）

目標時程：**7 月底封測 → 9 月正式開放家長使用**。
本次掃描範圍：23 個頁面、5 個共用 lib、19 個 SQL migration、types、專案設定。
技術棧確認：TypeScript + Next.js 14（App Router）+ React 18 + Tailwind + Supabase（純前端直連，anon key）。

---

## 一、今天已直接修復（低風險，共 18 項）

### 基礎建設
1. **Git 版本庫修復**：`.git/index` 損毀＋4 個殘留 lock 檔已清除，index 已從 HEAD 重建，現在可正常 commit。
2. **`.env.local` 與 `tsconfig.tsbuildinfo` 移出 git 追蹤**（`git rm --cached`）。`.env.local` 只含 anon key（本來就是公開的），無金鑰外洩，但機密設定檔不該進版本庫。
3. **20 個 TypeScript 型別錯誤全數修復**（之前被 `ignoreBuildErrors` 靜音）：
   - `tsconfig.json` 補上 `"target": "es2017"`（修掉 8 個 Set 迭代錯誤）
   - students 頁 `Field` 元件補型別（9 個 implicit any）
   - manager 頁 recharts formatter、pickup 頁 realtime payload、schedule 頁 env 非空斷言
4. **`next.config.mjs` 移除 `typescript.ignoreBuildErrors`**：從今起型別錯誤會擋下 build，壞碼無法上線。（eslint ignore 暫時保留，規則整理後再收緊。）

### 功能 bug
5. **第二位家長看不到孩子**：my-child、pickup、leave、payment、progress、grades、首頁角色偵測共 8 處查詢只比對 `parent_id`，已全部改為同時比對 `parent_id_2`。此前用第二家長身分登入會查無孩子、無法請假／呼叫接送／看繳費。
6. **首頁「綁定申請」計數永遠是 0**：讀錯資料表（`parent_student_links` → 已改為 `student_link_requests`）。
7. **UTC 時區 bug（32 處、8 個檔案）**：全站用 `toISOString()` 取「今天」，台灣凌晨 00:00–08:00 會拿到前一天，影響點名、成績登錄、繳費日期、請假預設值、戰情室期間篩選。已建立 `lib/dateUtils.ts` 的 `localDateStr()` 統一取本地日期。
8. **繳費頁權限不一致**：首頁卡片依 `viewPayments` 權限顯示，但繳費頁本身用硬編碼角色清單擋人——被授權的老師點進去會被踢回首頁。已改為與權限系統一致。
9. **請假審核越權**：任何非家長角色（含一般老師）都能核准／駁回全校任何假單。已改為需要 `approveLeave` 權限才能審核。
10. **接送語音播報外洩**：家長端也會語音播報其他學生的姓名。已改為只在教職員端且手動開啟廣播時播報（並修正 realtime callback 讀到過期狀態的閉包 bug）。
11. **家長可代簽任何聯絡簿**：簽名只用紀錄 id 不驗證是否自己孩子。已加上前端擁有權檢查（正式防線仍需 RLS，見下）。
12. **行政人員可把任何人升為總園長**：admin 頁角色下拉沒有分級。已改為只有總園長／超級管理員能指派管理階層角色。（前端防護；後端強制需靠 RLS，見下。）
13. **聊天聯絡人載入整列個資**：`select('*')` 會把全校家長／教職員的電話、權限設定等整列拉到瀏覽器。已縮減為只取顯示所需的 5 個欄位。
14. 請假頁「本月累積人次」實為全部假單數，標籤已修正為「全部請假單」。

驗證：修復後 `tsc --noEmit` **0 錯誤**（原本 20 個）。完整 production build 因沙盒單次執行時間上限無法跑完（環境限制，與程式碼無關），請在你的電腦執行 `npm run build` 做最終確認——現在型別錯誤會正確擋下 build。

---

## 二、🔴 重大問題——需要你決策，封測前必須處理

### R1. 資料庫沒有真正的權限隔離（最嚴重）
你的 app 是純前端直連 Supabase，**RLS（資料列安全）是唯一真正的防線**，但目前：
- Production 的 `students`（152 筆）、`users`（23 筆）**RLS 根本沒開**；其他表的 policy 全是 `USING (true)`＝形同虛設。
- 結論：懂技術的人拿瀏覽器裡的公開 anon key，**不用登入**就能讀寫全部學生姓名、電話、成績、繳費紀錄。
- 就算套用了新的 migration 010，隔離粒度也只到「補習班」層級——封測期間所有人同一間，**家長 A 依然能讀寫家長 B 小孩的一切資料**，甚至能改成績、讀別人的親師私訊。

**必要動作**（建議順序）：
1. 修改 migration 010：為 parent 角色另建 policy（`students` 限 `parent_id = auth.uid() OR parent_id_2 = auth.uid()`，子表透過 join 限制；寫入限教職員）；`users` 的 SELECT 限「自己」或教職員。
2. `audit_logs`／`consent_records` 等合規表改為只能 INSERT，禁止使用者 UPDATE/DELETE（目前可滅證）。
3. `role_configs`（權限設定表）絕不能讓一般使用者可寫——否則家長可自己開權限。
4. 在 Supabase preview branch 完整演練後才上 production。

### R2. Auth Hook 有致命 bug（照文件做會全站掛掉）
`docs/supabase-auth-hook-setup.md` 的寫法會覆寫 JWT 頂層 `role` claim，而 PostgREST 用它做資料庫角色切換——一旦啟用，**所有 API 請求直接 500**。必須改用自訂 claim（例如 `user_role`），並同步修改 migration 010/011 內所有讀取該 claim 的函式。

### R3. 146 位真實學生個資已進 git 歷史
`supabase/seed_students.sql` 含真實學生中英文姓名＋家長手機明文，已被 commit。需要：刪檔＋用 `git filter-repo` 清除歷史；若 repo 曾推到任何遠端或給過協作者，依 `docs/pii-protection-plan.md` 做外洩評估。**這件事與封測無關，本週就該做。**

### R4. Migration 003／006 一跑就會弄壞現役功能
- 003 要 DROP 的 `system_logs`、`pick_up_queue`、`classes` 等表，**程式碼還在用**（稽核日誌全站都寫 `system_logs`）。
- 006 要 DROP 的 `parent_phone`／`parent_2_phone` 欄位，是**家長綁定流程的比對依據**——跑下去綁定功能直接中斷。
- 必要動作：先改程式碼（或建相容 view）再跑 migration；`system_logs` vs `audit_logs` 二選一並統一。

### R5. 聊天訊息欄位分裂（訊息互相看不到）
聊天主頁寫讀 `message` 欄，聯絡簿內建聊天寫讀 `content` 欄——同一張表。從聯絡簿發的訊息在聊天主頁是空白。需確認 live DB 兩欄位的實際資料量後統一欄位＋搬資料。**這是家長封測第一天就會踩到的核心功能。**

### R6. 刪一個家長會連鎖刪光學生所有資料
`students.parent_id` 是 `ON DELETE CASCADE`，子表（成績／出缺席／繳費／聯絡簿）也全是 CASCADE——刪除一個家長帳號會把學生本體＋全部歷史一起刪掉。建議改 `SET NULL`。

### R7. 學生照片是公開 URL
`contact_photos` bucket 用 public URL 且找不到任何 storage policy——拿到網址就能看學生照片。應改 private bucket + signed URL。

---

## 三、🟡 重要問題（建議封測前處理）

1. **老師↔班級有三套互不相通的資料來源**：admin 頁寫 `users.responsible_classes`，學生資料庫／點名／課程進度讀 `teacher_assignments`（由排課頁寫入），舊 staff 頁用 `classes`。用 admin 頁指派班級的老師，在點名頁會被判定「沒有班級」。建議統一為 `teacher_assignments`。
2. **加密機制是裝飾性的**：migration 008/009/011 的加密設計在純前端架構下不可行（金鑰會發到每個瀏覽器、transaction-local 設定跨請求失效），且 app 有 0 個對應的 RPC 呼叫。需要重新設計（走 Edge Function）或明確降級為「靜態備份加密」。
3. **新增老師會產生永遠無法登入的孤兒帳號**（`@tombear.internal` + 隨機密碼），會持續累積；刪除使用者也只刪 `users` 列，auth 帳號與學生外鍵殘留。這兩個都需要後端（Edge Function／service role）才能正確處理。
4. **兩個死頁面**：`/dashboard`（用已廢棄的 `pick_up_queue`，還有會建立孤兒學生的舊表單）與 `/staff`（用已廢棄的 `classes`）。建議直接刪除（等你確認，我沒動）。
5. **點名 upsert 依賴 `(student_id, date, class_group)` 唯一鍵**——需確認 live DB 真的有這條 unique constraint。
6. `exam_results` 無防重複鍵：seed 檔重跑會把成績塞兩份。
7. 大量查詢忽略 `error` 回傳值——RLS 上線後如有 policy 問題會靜默顯示空資料、極難除錯。建議至少在 manager／chat／pickup 補上錯誤處理。
8. 老師預設可編輯／刪除主任發的公告、可發「全員」公告——建議收斂。
9. `types/database.ts` 與實際 schema 嚴重脫節（還有已刪除的表、缺 `tenants`／`chat_messages` 等）——migration 定案後用 `supabase gen types` 重新產生。
10. `chat_messages`、`pickup_requests` 等現役表在 repo 中沒有 CREATE TABLE——建議 `supabase db pull` 產出 baseline，否則無法重建環境。

## 四、🟢 次要（封測後再說）

`schema.sql` 已是死文件（標註 deprecated 即可）、7 支散裝 legacy SQL 應歸檔到 `legacy/`、`add_course_progress.sql` 缺時間戳前綴會排錯順序、`public/logo.png.png` 雙重副檔名、兩套稽核寫入格式不一致、`get_profile_id_by_email` 函式可被匿名者做 email 枚舉（REVOKE 即可）、manager 頁「每月學費收入趨勢」仍是 placeholder。

---

## 五、時程建議（對照 7/31 封測）

| 週次 | 重點 |
|---|---|
| **本週（7/2–7/5）** | R3 個資清理（急）；決定 R4 的 `system_logs` 歸屬；R5 確認 live DB 欄位資料 |
| **第 2 週（7/6–7/12)** | R1 RLS policy 重寫 + R2 Auth Hook 修正，在 preview branch 完整演練（`999_PRE_FLIGHT_CHECKLIST` 的 8 個 gate 目前 39 個檢查項全部未勾，必須走完） |
| **第 3 週（7/13–7/19)** | 套 migration 到 production；修 R4 程式碼配合；🟡1 班級資料源統一 |
| **第 4 週（7/20–7/26)** | 用「家長帳號」實測隔離（讀不到別人小孩＝過關）；R6/R7；回歸測試 |
| **7/27–7/31** | 緩衝＋封測名單上線 |

判斷標準很簡單：**「家長 A 登入後，用瀏覽器開發者工具直接打 API，讀不到家長 B 小孩的任何資料」——這件事沒做到之前，不能給真實家長使用。**

---

### 附註：本次修改的驗證方式
所有修改完成後以乾淨副本重放全部變更並執行 `npx tsc --noEmit`（**0 錯誤**）。完整 `next build` 受沙盒執行時間限制未能跑完，請在本機執行 `npm run build` 確認（另注意：本機 build 需要網路抓取 Google Fonts）。

另：本次工作中發現沙盒同步層對大檔案偶發截斷寫入，已逐檔比對修復（grades／students／payment 三檔的檔尾曾被截斷數行，已從 git 原始檔尾補回並驗證完整）。你電腦上的檔案為最終正確版本。commit 前建議先 `git diff` 過目一次今天的變更。
