# Employee Onboarding Checklist — 員工入職完整流程

> **目的**：當未來雇用第一個合作夥伴 / 員工時，照這份清單跑，確保他在 30 天內具備所有所需的知識、工具、權限與紀律，且全程合規。
> **撰寫日期**：2026-05-27
> **適用範圍**：未來雇用第 1-5 位員工時都用同一份清單
> **規範來源**：[`pii-protection-plan.md`](./pii-protection-plan.md) §8、[`backend-conventions.md`](./backend-conventions.md) §1、v3.0 §13 協作流程
> **預估流程**：報到前 7 天到開始上線後 30 天

---

## 0. 適用對象與時機

### 0.1 雇用 vs 合作

| 對象 | 適用本清單嗎？ |
|------|--------------|
| 全職員工 | ✅ 完整版（從 §1 到 §6）|
| 兼職員工 | ✅ 簡化版（跳過 §6 工程訓練）|
| 顧問 / 外包 | ✅ 但合約結構不同 |
| 短期實習生 | ⚠️ 要慎重 — 個資存取風險高 |
| 補習班內部老師 | ✅ 但跳過 §6 工程訓練、加上 §7 補習班專用 |

### 0.2 雇用時機建議

- **第 1 位員工**：對外有 5+ 付費客戶後（v3.0 §12.5 標準）
- **第 2-3 位員工**：付費客戶 10+ 之後
- **不要過早雇用**：你 1 人能應付的階段，多 1 個人是負擔不是助力

---

## 1. Day -7（報到前 1 週）— 文件準備

### 1.1 法律文件起草（律師完成）

- [ ] **雇用合約**：含工時、薪資、福利、離職條款
- [ ] **NDA（保密協議）**：律師起草，覆蓋：
  - 系統技術資料（程式碼、schema、加密 key 等）
  - 客戶個資（學生 / 家長資料）
  - 商業資料（客戶名單、定價、財務）
  - 「實體派」教育研究內容（stealth 階段內容）
  - 違約罰則：建議違反 NT$500,000 + 法律責任
- [ ] **個資處理同意書**：員工自身的個資被你蒐集的同意書
- [ ] **競業條款**（選用，需有對價）：離職後 X 年內不得加入同業

⚠️ 三份文件**律師務必 review**。一次性費用約 NT$15,000-30,000，分攤到未來所有員工。

### 1.2 工作工具預備清單

- [ ] **電腦**：補習班配發 OR 員工自帶（自帶要簽 BYOD 政策）
- [ ] **企業 Email**：建立 `[firstname]@intelligent-kids.com`（或你的網域）
- [ ] **1Password / Bitwarden** 家庭方案邀請（共享 vault 給此員工）
- [ ] **Slack / Discord / LINE** 工作群組邀請
- [ ] **物理鑰匙**（如果需要進補習班）

### 1.3 帳號預備（**不要先建立**，等他到職當天才建）

對下列服務記下「待建立」清單，**到職當天才建**：

- [ ] Supabase Dashboard 邀請
- [ ] Vercel team 邀請
- [ ] GitHub repo 邀請
- [ ] Vercel team 邀請
- [ ] 系統內 admin 帳號
- [ ] 1Password / Bitwarden vault 邀請

⚠️ **絕對不要提前建立帳號** — 萬一他臨時不來，帳號要全部撤。提前建立 = 多一個風險點。

---

## 2. Day 0（報到當天）— 上午

### 2.1 (08:30-09:00) 歡迎、環境參觀

- [ ] 介紹補習班空間、座位
- [ ] 介紹其他員工（如有）
- [ ] 拿到電腦 / 證件 / 鑰匙

### 2.2 (09:00-10:30) 簽法律文件（1.5 小時）

⚠️ **本流程必須**「簽完才能給任何系統存取權」。

- [ ] 雇用合約簽署（每份 2 份正本，員工留 1 份、公司留 1 份）
- [ ] **NDA 簽署 + 詳細解釋每個條款**
  - 不要讓員工「快速簽完」 — 至少花 20 分鐘逐條走過
  - 員工可以提問
  - 重點強調「客戶個資不可外洩」「不可離職後挪用」
- [ ] 個資同意書簽署
- [ ] 競業條款（如有）
- [ ] 文件影印 / 掃描 / 歸檔

### 2.3 (10:30-11:30) 個資保護專題訓練（1 小時）

⚠️ 這 1 小時**極重要** — 沒這個訓練就直接給系統權限的，是「無證駕駛」。

教什麼：

- [ ] **三紅線授權原則**（v3.0 §13.2）：費用、系統癱瘓、個資外洩
- [ ] **PII 定義**（pii-protection-plan §2）：什麼算個資
- [ ] **PII 防護九層架構**（pii-protection-plan §3）：你會擔任哪幾層
- [ ] **常見錯誤**：
  - ❌ 把學生資料截圖傳 LINE 群組
  - ❌ Email 內含學生姓名 + 電話
  - ❌ 印出來的學生名單沒銷毀
  - ❌ 跟朋友（不是同事）聊客戶資料
- [ ] **發現問題怎麼辦**：
  - 自己疑似洩漏 → 24 小時內告訴 Telly（沒罰則，重在誠實）
  - 看到他人疑似洩漏 → 立刻告訴 Telly
  - 收到外部詢問（記者、警察等）→ 不回應、回報 Telly

### 2.4 (11:30-12:00) 系統大圖介紹（30 分鐘）

不要急著給帳號。先讓他懂大圖：

- [ ] 我們的產品是什麼（Intelligent Kids + 湯貝爾）
- [ ] 客戶是誰、有幾家
- [ ] 收入怎麼來
- [ ] 你的角色定位
- [ ] 公司未來 3 年方向

### 2.5 (12:00-13:00) 午餐 + 不正式的交流

讓他放鬆。建立信任。

---

## 3. Day 0（報到當天）— 下午

### 3.1 (13:00-14:00) 帳號開通（1 小時）

⚠️ **第一次給權限的原則：給最少必要的權限**

- [ ] 建 Supabase Dashboard 邀請 → 設成 **Developer** 角色（不是 Admin）
  - 能讀 logs、看 schema
  - 不能改 Project Settings、不能看 Vault
- [ ] 建 Vercel team 邀請 → 設成 **Developer**
- [ ] 建 GitHub repo 邀請 → 設成 **Triage** 或 **Read**
- [ ] **不要給** service_role key、encryption key、hash key
- [ ] **不要給** Telly 個人的 platform_admin 帳號
- [ ] 系統內建一個新 user，role = `admin`（不是 `platform_admin`）
- [ ] 強制要求每個帳號**立刻設 2FA**

### 3.2 (14:00-16:00) 文件閱讀清單（2 小時）

按順序給他看，每讀完一份你跟他講 10 分鐘確認他理解：

1. [ ] **v3.0 報告第 0 章「方向轉向紀錄」** — 為什麼我們這樣做
2. [ ] **v3.0 報告第 13 章「協作流程」** — 怎麼跟 AI 工具協作
3. [ ] **pii-protection-plan.md §3 九層防禦架構** — 個資怎麼防
4. [ ] **backend-conventions.md §1 三紅線 + §8 禁止 vs 必做** — 技術規範

⚠️ **不要讓他自己讀** — 跟他一起讀，他不懂就解釋。讀完每份花 5-10 分鐘問他「你看完最重要的 3 個 takeaway 是什麼？」確認真懂了。

### 3.3 (16:00-17:00) 自由探索（1 小時）

- [ ] 讓他自己在系統內逛 — 但**不要碰真實學生資料**
- [ ] 可以建一個 fake_tenant 給他練習用
- [ ] 你在旁邊 stand by 回答問題

### 3.4 (17:00-17:30) 第 1 天總結

- [ ] 你今天學到什麼？最有疑問的 3 件事？
- [ ] 明天要做什麼？

---

## 4. Week 1（第 1-5 天）— 深度訓練

### Day 1 已做完 §2-3。Day 2-5：

### 4.1 Day 2：個資合規深入

- [ ] 上午：讀 `pii-protection-plan.md` 剩餘章節（§4-9）
- [ ] 下午：跑一次模擬「個資外洩演習」
  - Telly 假裝：「我剛剛 commit 了 secret key 到 GitHub，怎麼辦？」
  - 員工要說出 `encryption-key-rotation-runbook.md` §2 的步驟
  - 答不出來 → 再讀一次

### 4.2 Day 3：技術架構深入（如果是工程師）

- [ ] 讀 `backend-conventions.md` 全部
- [ ] 讀 `code-refactor-roadmap.md` §0-2
- [ ] 讀 `supabase-auth-hook-setup.md`
- [ ] 寫一個 toy task（例如建一個 readonly endpoint）熟悉 codebase

如果**非工程師**：跳過 Day 3，改為「教育產業 / 補教實務知識」訓練。

### 4.3 Day 4：客戶支援訓練（如果會接觸客戶）

- [ ] 讀 `phase-c-beta-test-protocol.md` §4.1 訪談題綱
- [ ] 讀 `launch-to-market-plan.md` §8 常見 objections
- [ ] Roleplay：你扮家長抱怨，他練習回應

### 4.4 Day 5：災難演練

- [ ] 讀 `disaster-recovery-runbook.md`
- [ ] 讀 `incident-response-templates.md`
- [ ] Roleplay：Telly 給情境，他必須說「該怎麼處理」
  - 場景 1：客戶說「我登入不了」（auth issue）
  - 場景 2：production 突然回應變慢
  - 場景 3：發現 audit_logs 有異常存取
  - 場景 4：家長 LINE 抱怨資料外洩

### 4.5 Week 1 結束的 review

- [ ] 跟他 1 對 1 對話 30 分鐘：
  - 「第一週感覺如何？」
  - 「最不確定的事是什麼？」
  - 「下週想專注學什麼？」
- [ ] 你自己評估：他的 onboarding 是否順利？需不需要延長訓練期？

---

## 5. Month 1（第 1-30 天）— 漸進放權

### 5.1 Week 2：陪同模式

- [ ] 真實任務 + 你 review
- [ ] 任何寫入 production 的操作必須先跟你確認
- [ ] 任何讀取 PII 的操作必須在你看得到的時段做

### 5.2 Week 3：監督模式

- [ ] 真實任務獨立做
- [ ] 你每天結束 review 他當天的 commit / 操作
- [ ] 任何錯誤立即指出

### 5.3 Week 4：放手模式

- [ ] 完全獨立執行
- [ ] 你每週 review 一次
- [ ] 月底 1-on-1 績效對話

### 5.4 Month 1 結束評估

跟員工 1 對 1 對話 1 小時：

- [ ] 「30 天感受如何？」
- [ ] 「你覺得自己的強項在哪？」
- [ ] 「不確定 / 想學的是什麼？」
- [ ] 「對公司有什麼建議？」
- [ ] Telly 給回饋：做得好的、需改進的、未來方向

如果不適任：誠實談、給 plan、必要時轉換方向（或試用期結束）。

---

## 6. 工程師 onboarding 額外項目

如果新員工是技術 / 工程角色：

### 6.1 開發環境設定

- [ ] 拿到 GitHub repo access
- [ ] Clone repo 到本機
- [ ] 跑 `npm install` + `npm run dev` 成功
- [ ] 可連到 dev Supabase（個人 sandbox project）
- [ ] **不可以**直接連 production Supabase（除非緊急 + Telly 在場）

### 6.2 第一個 PR

- [ ] 修一個 Minor bug（例：page-audit.md §3.3 的 reset-password timeout）
- [ ] 走完整 PR 流程：分支 → commit → push → PR → review → merge
- [ ] 過程 Telly 全程觀察

### 6.3 Code style

- [ ] 讀懂 backend-conventions.md 全部
- [ ] 知道何時用 browser client / server client / service_role client
- [ ] 知道 PII 欄位讀寫的 RPC pattern
- [ ] 知道 `operational_events` 怎麼寫

---

## 7. 補習班員工專用項目（非工程）

如果新員工是補習班內部（老師、行政、班導），跳過 §6，改加：

### 7.1 補教實務培訓

- [ ] 湯貝爾的教學理念（你可以先講「實體派」框架，但他要簽 NDA 後才能讀完整版）
- [ ] 班級管理流程
- [ ] 親師溝通標準

### 7.2 系統使用培訓（30 分鐘）

- [ ] 老師端：聯絡簿、出缺席、課程進度
- [ ] 行政端：學生資料管理、繳費紀錄
- [ ] 限定權限：只能看自己負責班級的學生

---

## 8. 離職員工 offboarding 流程

⚠️ **入職清單的反向版本** — 員工最後一天必跑：

### 8.1 Day -1（離職前 1 天）

- [ ] 跟他確認最後一天工作內容
- [ ] 確認他的權責交接給誰
- [ ] 提醒 NDA 持續生效（即使離職）

### 8.2 離職當日

- [ ] 撤銷 Supabase Dashboard 帳號
- [ ] 撤銷 Vercel team 帳號
- [ ] 移除 GitHub repo collaborator
- [ ] 系統內帳號 set `is_approved = false`
- [ ] 取回實體鑰匙 / 識別證 / 公司電腦
- [ ] 從 LINE 群組移除
- [ ] 1Password vault 移除存取
- [ ] 信箱 forward 設好（保留 30-90 天，再撤銷）
- [ ] **如果他知道 encryption_key / hash_key → 立刻啟動 rotation**（見 encryption-key-rotation-runbook.md）

### 8.3 離職後 7 天內

- [ ] Review 他離職前 30 天的 `access_log` — 確認沒有異常大量存取
- [ ] Review 他離職前 30 天的 git commits — 確認沒有可疑 commit
- [ ] 寫 offboarding report 存 `docs/staff-changes/YYYY-MM-DD-{name}-offboarding.md`

### 8.4 離職後 90 天

- [ ] 信箱 forward 撤銷
- [ ] 完全 disable 該員工系統帳號

---

## 9. 員工資料庫範本

每位員工建一份 `docs/staff/{employee-id}.md`（不上 git，私人）：

```markdown
# 員工檔案 — [代號]

- 入職日期：YYYY-MM-DD
- 角色：[role]
- 部門：[department]
- 雇用合約版本：v1.0
- NDA 簽署日：YYYY-MM-DD
- 個資訓練完成日：YYYY-MM-DD

## 帳號清單

- [ ] Supabase Dashboard：[username]
- [ ] Vercel：[username]
- [ ] GitHub：[username]
- [ ] 系統 admin 帳號 user_id：[uuid]
- [ ] 1Password 加入：YYYY-MM-DD

## 知道的 secrets / keys

- [ ] encryption_key？是 / 否
- [ ] hash_key？是 / 否
- [ ] service_role key？是 / 否

如果離職 → 上述任一「是」就必須 rotation。

## 季度評估紀錄

| 時間 | 評估摘要 |
|------|---------|
| YYYY-Q1 | ... |

## 離職紀錄

（離職時填）
```

---

## 10. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-27 | v1.0 草擬 | Claude（Telly 回國後綠燈） |

---

**文件結束**

> 員工是補教 SaaS 最大的安全變數。30 天系統化 onboarding = 一輩子的 risk reduction。
