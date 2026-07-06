# 個資防護完整計畫 — PII Protection Plan

> **目的**：對 Tom Bear / Intelligent Kids 平台所有個資（PII）建立**九層防禦架構**，確保現有資料（152 學生 + 23 員工）與未來累積資料都受到法律、技術、流程三面向的保護。
> **撰寫日期**：2026-05-08（Telly 出差期間，Claude 撰寫）
> **文件性質**：跨 Phase A-D + AI 化階段的長期規範
> **規範來源**：v3.0 報告 §6（個資合規）、§10.6（RLS）、week0-tech-decisions.md 決議 4（雙資料池）、backend-conventions.md §1（三紅線）
> **適用對象**：Telly、所有 AI 工具、未來雇員 / 合作夥伴、律師（review 用）

---

## 0. 為什麼需要這份文件

### 0.1 你目前面對的風險

你 production 環境**現在有**：

- **152 筆學生資料**（含本名、家長電話、生日、過敏資訊）
- **924 筆考試成績**（學生本名 + 分數）
- **96 筆請假紀錄**
- **23 個員工帳號**（email + 電話 + 角色權限）

**目前的保護等級**：

- ✅ HTTPS（Vercel 自動）
- ✅ Supabase Auth 控管登入
- ✅ 應用層的 permissions.ts（role-based check）
- ❌ 資料庫**沒有**欄位級加密（DB 直查就是明文）
- ❌ Row-Level Security 大多沒啟用（schema audit §5）
- ❌ 沒有完整的存取日誌
- ❌ 沒有個資外洩應變 SOP

**這是「能用 + 半合規」的狀態**。任何一個小事故（員工筆電丟、密碼外洩、SQL 漏洞）都可能造成不可挽回的個資外洩。

### 0.2 為什麼是「最重要的事」

引用 Telly 2026-05-08 原話：

> 「不管現在現有的、已完成的 project，或者是我們後面要把架構搭建出來，其實最重要的東西就是『個資』。我們要怎麼樣防範它外洩？」

理由：

1. **法律**：個資法第 28 條最高 NT$1,500 萬 + 兒少法另有規範
2. **信任**：補教產業的家長對個資外洩零容忍。一次外洩 = 公開信譽崩盤
3. **商業**：你想對外賣這套系統 = 你的客戶（其他補習班）會逼問你的個資合規
4. **道德**：保護未成年人的資料是 baseline 道德責任

**個資外洩比 server 當機嚴重 100 倍**。Server 當機半小時可以修復，個資外洩半小時的影響你可能 5 年才能洗清。

---

## 1. 核心原則 — Zero-trust on PII

### 1.1 三條基本原則

#### 原則 1：「不該收的，就不要收」（資料最小化）

- 設計新功能前先問：「這個欄位非要不可嗎？」
- 預設「不收」，要說服自己才能收

例：「家長 LINE ID」要不要存？
- ❌ 反射答：「方便聯絡就存吧」
- ✅ 思考後：「目前已有電話 + email + 系統內訊息，LINE ID 多此一舉 → 不收」

#### 原則 2：「收了，就當作明天可能要解釋」

- 每個 PII 欄位都要能回答：
  - 為什麼收？（蒐集目的）
  - 何時刪？（保存期限）
  - 誰能看？（存取權限）

如果這三題回答不出來 → 不該收。

#### 原則 3：「假設你會犯錯」

- Backup 可能被偷
- 員工可能離職
- 你自己可能 commit 錯東西
- 加密 key 可能漏
- AI 工具可能誤把資料傳出去

**所有防禦設計都要假設「上述任一發生」**，靠多層防禦讓單點失敗不會致命。

### 1.2 「需要才看」原則（Need-to-know）

不是所有員工都該看所有資料：

| 角色 | 看得到的 PII 範圍 |
|------|------------------|
| 總園長 / Director | 全部 |
| 班主任 / English Director | 自己部門 |
| 老師 / Teacher | 自己負責班的學生 |
| 行政 / Admin | 配置上設的範圍 |
| 家長 / Parent | 只看自己孩子 + 公告 |
| Platform Admin（Telly）| 跨 tenant 但有 access_log 追蹤 |

⚠️ 「Telly 自己」也不該濫看資料。Migration 010 的 RLS policy 雖然給 platform_admin 特權，但**每次跨 tenant 查詢都會寫進 access_log**，未來若有糾紛你自己也要能解釋為什麼看。

---

## 2. PII 定義 — 適用台灣法律

### 2.1 個資法定義（直接適用 Tom Bear）

依「個人資料保護法」第 2 條，個資 = **得以直接或間接識別個人之資料**。包括但不限於：

| 類別 | 範例 |
|------|------|
| 直接識別 | 姓名、身分證字號、出生年月日 |
| 間接識別 | 學號 + 班級（足以查到本人）、家長電話、地址 |
| 敏感個資 | 病歷、健康、犯罪前科、性生活、社會福利、宗教信仰 |
| 兒少特別保護 | 12 歲以下兒童的任何個資（兒少法第 70 條） |

### 2.2 Tom Bear 系統現有 PII 欄位完整清單

#### 學生資料（students 表）

| 欄位 | 是否個資 | 等級 |
|------|---------|------|
| `chinese_name` | ✅ 直接識別 | 一般 |
| `english_name` | ✅ 直接識別 | 一般 |
| `birthday` | ✅ 直接識別 | 一般 |
| `school_grade` | ⚪ 間接識別（搭配其他資訊） | 一般 |
| `grade`（補習班班別）| ⚪ 同上 | 一般 |
| `parent_phone` / `primary_contact_phone` | ✅ 直接識別 | 一般 |
| `parent_id` (FK to users) | ✅ 透過 user 可查家長 | 一般 |
| `parent_relationship` | ⚪ 配合 parent_id | 一般 |
| `pickup_method` | ⚪ 行為資料 | 一般 |
| `allergies` | ✅ **敏感個資**（健康相關）| 🔴 高 |
| `special_needs` | ✅ **敏感個資**（健康 / 心智）| 🔴 高 |
| `photo_url` | ✅ **生物特徵**（容貌）| 🔴 高 |
| `internal_note` / `teacher_note` | ⚠️ 可能含敏感資訊 | 視內容 |
| `strength_tags` / `improvement_tags` | ⚠️ 可能涉及學習評價 | 視內容 |

#### 員工資料（users 表）

| 欄位 | 是否個資 | 等級 |
|------|---------|------|
| `name`、`email`、`phone` | ✅ 直接識別 | 一般 |
| `contact_info` (JSONB) | ✅ 同上 | 一般 |
| `is_super_admin`、`role` | ⚪ 角色資訊 | 一般 |

#### 操作紀錄（多張表）

| 欄位 | 是否個資 | 等級 |
|------|---------|------|
| `audit_logs.ip_address` | ✅ 間接識別 | 一般 |
| `access_log.actor_ip` | ✅ 同上 | 一般 |
| `chat_messages.message` | ⚠️ 可能含個資 | 視內容 |
| `announcements.content` | ⚠️ 可能含 | 視內容 |

#### exam_results 表的反正規化欄位

| 欄位 | 是否個資 |
|------|---------|
| `student_name` | ✅ 反正規化的學生姓名（重複 PII） |

⚠️ 此欄位是 schema 設計缺陷 — students 表已有姓名，exam_results 不該重複存。Phase A migration 008 會加密這個欄位，但更好的解法是 Phase D 之後 drop 此欄位（用 JOIN 取代）。

### 2.3 不算個資但要小心的東西

- **匿名化操作數據**：經過 `operational_events` 設計（HMAC anon_id + class_anon_code + age_band）後，**不算個資**，可用於研究。
- **聚合統計**：「全校平均出席率 87%」這類**不指向特定個人**的數字，不算個資。
- **公開資料**：補習班名稱、地址、招生簡章內容等已公開的不算個資。

### 2.4 跨境傳輸特別說明

當你呼叫 AI API（Anthropic / OpenAI），資料**會傳到美國**。依個資法第 21 條：

- 必須在同意書**明示**「資料會傳到美國等境外 AI 服務商處理」
- 必須讓家長有**拒絕**的選項（雖然拒絕後該功能無法使用是合理）
- v3.0 §6.2「特別重要 1」已涵蓋這點，consent_records.agreed_to_ai_processing 欄位追蹤

---

## 3. 九層防禦架構（Defense in Depth）

每一層都假設「上一層可能失效」。九層全部到位才算完整防禦。

```
┌─────────────────────────────────────────────────┐
│ 第 9 層：人員作業規範 (Operational Security)     │
├─────────────────────────────────────────────────┤
│ 第 8 層：第三方資料協議 (Vendor DPA)             │
├─────────────────────────────────────────────────┤
│ 第 7 層：應用層輸出過濾 (Output Sanitization)    │
├─────────────────────────────────────────────────┤
│ 第 6 層：存取稽核日誌 (Audit Logging)            │
├─────────────────────────────────────────────────┤
│ 第 5 層：存取控制 (RLS + Role-based Access)     │
├─────────────────────────────────────────────────┤
│ 第 4 層：傳輸加密 (TLS Everywhere)              │
├─────────────────────────────────────────────────┤
│ 第 3 層：靜態加密 (At-rest Encryption)          │
├─────────────────────────────────────────────────┤
│ 第 2 層：資料最小化 (Minimize Collection)        │
├─────────────────────────────────────────────────┤
│ 第 1 層：法律基礎 (Consent + Legal Basis)        │
└─────────────────────────────────────────────────┘
```

下面逐層展開。

---

### 第 1 層：法律基礎（Consent + Legal Basis）

**目的**：確保所有 PII 蒐集都有法律允許的目的。

**現況（2026-05）**：

- ❌ 沒有正式的個資同意書
- ❌ 沒有同意書版本管理
- ⚠️ 152 筆學生資料當初是怎麼進系統的不清楚（有沒有家長同意？）

**Phase A 後**：

- ✅ `consent_records` 表（migration 002）追蹤每位家長的同意內容
- ✅ 同意書條款明示三件事：基本資料、AI 服務商處理、研究目的（v3.0 §6.2）
- ✅ 家長可隨時撤回（`revoked_at` 欄位）

**持續責任**：

- [ ] 每位現有家長補簽新版同意書（Phase C 封測前完成）
- [ ] 律師 review 同意書一次（NT$15,000-30,000，建議找熟悉教育產業的）
- [ ] 同意書版本變動 → 重新通知家長簽（v1 → v2 等）

**失敗指標**：

- 🚨 出現任何「沒簽同意書的家長 / 學生資料」存在 system 中
- 🚨 同意書被律師指出條款不合規

---

### 第 2 層：資料最小化（Minimize Collection）

**目的**：能不收的就不收。少一個欄位 = 少一個外洩風險點。

**現況**：

- ⚠️ `students` 表有 26 個欄位，包含 4 個重複的 phone 欄位（schema audit §4.3）
- ⚠️ `exam_results.student_name` 是反正規化重複存的個資

**Phase A 後**：

- ✅ Migration 006 合併 4 個 phone 為 2 個（primary + secondary）
- ✅ Migration 005 重建 contact_books schema 移除冗餘欄位
- ⚠️ `exam_results.student_name` Phase A 不 drop（避免破壞應用），但**標記為「Phase D 後 drop」**

**持續責任**：

- 加新欄位前跑檢查：「這個 1 年後還會用嗎？」
- 季度檢視「最近 1 年從未被讀取的個資欄位 → 候選 drop」
- 學生畢業 / 結業 5 年後 → 觸發資料銷毀流程（個資法第 11 條）

**失敗指標**：

- 🚨 加了個資欄位但沒記在這份 plan 的 §2.2
- 🚨 結業 5+ 年的學生資料還在 production

---

### 第 3 層：靜態加密（At-rest Encryption）

**目的**：DB 被偷走、backup 被偷走，也看不到內容。

**現況**：

- ❌ DB 內所有 PII 都是明文。直接 SELECT 就看到「王小明、0912-345-678」
- ✅ Supabase 底層 disk encryption（AWS 預設）

**Phase A 後**：

- ✅ pgcrypto 對稱加密（migration 008）— 18 個 PII 欄位轉成 BYTEA
- ✅ Encryption key 存 Supabase Vault + 離線備份
- ✅ Hash key 分開保存（HMAC 用於可搜尋性）

**持續責任**：

- [ ] Encryption key 每 12 個月輪換一次（見 [`encryption-key-rotation-runbook.md`](./encryption-key-rotation-runbook.md)）
- [ ] 員工離職後 7 天內 rotation
- [ ] Key 任何疑似外洩 → 立刻 rotation

**失敗指標**：

- 🚨 任何 PII 欄位**未加密**（schema audit 必須清零）
- 🚨 Encryption key 出現在程式碼、commit、Slack、Email
- 🚨 加密未經過 round-trip 驗證直接上 production

---

### 第 4 層：傳輸加密（TLS Everywhere）

**目的**：資料在網路中傳輸不被攔截。

**現況**：

- ✅ Vercel 自動配置 HTTPS（Let's Encrypt 自動換）
- ✅ Supabase 強制 TLS 連線
- ⚠️ 沒有 HSTS / CSP 等進階 header

**Phase A 後**（未來增強）：

- [ ] 加 HSTS header（強制 browser 永遠用 HTTPS）
- [ ] 加 Content-Security-Policy（防 XSS）
- [ ] 自有網域時用 EV SSL 憑證（更高信任）

**持續責任**：

- 每季用 https://www.ssllabs.com/ssltest/ 跑一次 grade（目標 A 以上）
- TLS 憑證到期前 30 天確認自動更新

**失敗指標**：

- 🚨 任何 endpoint 走 HTTP（連管理後台都不可）
- 🚨 SSL Labs grade 低於 A
- 🚨 出現 mixed content（HTTPS 頁面引入 HTTP 資源）

---

### 第 5 層：存取控制（RLS + Role-based）

**目的**：使用者 A 不能讀取使用者 B 該看的資料。

**現況**：

- ⚠️ 7 張關鍵表 RLS 已停用但有殘留 policies（schema audit §5.1）
- ✅ 應用層 `lib/permissions.ts` 做 role-based check（但這只是第一道）

**Phase A 後**：

- ✅ Migration 010 全套 RLS policies 上線
- ✅ JWT 內含 tenant_id（透過 Auth Hook）
- ✅ platform_admin 特權跨 tenant，但**會寫 access_log**

**持續責任**：

- 任何新表上線**必須**設 RLS policies（在 backend-conventions.md §8 列為必做）
- 每季跑「跨 tenant 隔離測試」確認沒漏洞
- 員工角色變動 → 強制其重新登入（讓新 JWT 生效）

**失敗指標**：

- 🚨 任何業務表 RLS = disabled
- 🚨 e2e 測試發現 tenant A 能讀到 tenant B 的資料
- 🚨 應用層出現 `eq('tenant_id', ...)` 寫法（應靠 RLS，不靠應用層）

---

### 第 6 層：存取稽核日誌（Audit Logging）

**目的**：誰看了誰的資料、什麼時候、為什麼。事後追責 + 偵測異常。

**現況**：

- ⚠️ `audit_logs` 表記管理操作但**不記資料讀取**
- ❌ 沒有 IP 加密 / 沒有完整存取追蹤

**Phase A 後**：

- ✅ Migration 002 建立 `access_log` 表（讀取 PII 必寫一筆）
- ✅ IP 加密保存（migration 008）
- ✅ backend-conventions.md §4.4 規範必寫流程

**持續責任**：

- [ ] 每月跑一次「異常存取偵測」：
  - 平均 1 人 1 小時讀超過 50 筆學生 → flag
  - 半夜 2-5 點的存取 → flag
  - 同 IP 用 3+ 不同帳號登入 → flag
- [ ] access_log 保存至少 1 年（之後可歸檔）
- [ ] 季度 review：誰存取最多？是否合理？

**失敗指標**：

- 🚨 PII 讀取但**沒寫 access_log**
- 🚨 access_log 表超過 1 個月沒被任何人 query 過（沒人在監控）
- 🚨 出現大量短時間連續讀取但無人發現

---

### 第 7 層：應用層輸出過濾（Output Sanitization）

**目的**：避免「程式碼 bug 把 PII 從伺服器漏到外面」。

**典型風險**：

- 錯誤訊息回傳：「INSERT failed: chinese_name='王小明' constraint violation」→ 把姓名洩漏到 client
- API response 多回了 column：原本只該回 `id, grade`，bug 多回了 `chinese_name_encrypted` → client 看到 BYTEA 暴露
- 截圖 / log：開發者 console.log 學生資料 debug 後忘記移除
- Stack trace 洩漏：production 把 error stack 顯示給使用者

**現況**：

- ❌ 沒有系統化的 output sanitization
- ⚠️ Next.js 預設 production error 不顯示 stack（OK），但 API response 沒過濾

**Phase A 後**：

- [ ] backend-conventions.md §9.3 規範：所有 API response 用 Zod schema 過濾
- [ ] ESLint 規則：禁止 `console.log` 出現在 production code（dev only）
- [ ] Sentry / 監控設定：自動 mask 含 email/phone 格式的字串

**持續責任**：

- 任何 API 上線前過 Zod schema check
- 季度 grep code base：有沒有可疑的 `console.log` 漏網
- 錯誤訊息設計：給使用者看的訊息「籠統」，給 server log 的訊息「具體但無 PII」

**失敗指標**：

- 🚨 production console / Sentry 紀錄出現學生姓名 / 電話
- 🚨 API response 內含未過濾的加密欄位（BYTEA）
- 🚨 git commit 含個資 demo data（不該 mock 真實學生）

---

### 第 8 層：第三方資料協議（Vendor DPA）

**目的**：當資料離開你的系統到第三方（AI、Email、LINE 等），確認對方守規矩。

**目前接觸的第三方**：

| 服務 | 資料類型 | 風險 | DPA 狀態 |
|------|---------|------|----------|
| Supabase | DB 全部 + Auth | 🔴 高 | 已簽 Standard SaaS Agreement（含 GDPR DPA） |
| Vercel | request logs（可能含 URL 含學生 ID）| 🟡 中 | 已簽 |
| Anthropic（2026-08+）| 老師寫的觀察 → AI 擴寫 | 🔴 高 | **TODO**: 確認 DPA + opt-out 訓練 |
| OpenAI（2026-08+）| Whisper STT | 🟡 中 | **TODO**: 確認 DPA |

**Phase A 後（持續）**：

- [ ] AI 化前簽 Anthropic Zero Data Retention agreement（如有）
- [ ] AI 化前簽 OpenAI Enterprise（resists 訓練 opt-out）
- [ ] 跟未來客戶（其他補習班）簽 DPA — 你是 Processor，他們是 Controller

**持續責任**：

- 任何新接的服務 → 看其 DPA / Privacy Policy 才能接
- 拒絕「會用你的資料訓練模型」的服務（除非匿名化已徹底）

**失敗指標**：

- 🚨 接了未簽 DPA 的第三方服務
- 🚨 AI vendor 預設「會用客戶資料訓練模型」且沒 opt-out
- 🚨 客戶補習班沒簽 DPA 就讓他 onboard

---

### 第 9 層：人員作業規範（Operational Security）

**目的**：人是最弱的一環。流程要設計到「員工沒受訓也不會出包」的程度。

**典型風險**：

- 員工把 production DB credentials 截圖傳 LINE
- 員工筆電遺失（裡頭有未登出的 Supabase Dashboard）
- 釣魚信讓 admin 帳號被盜
- 離職員工帳號沒及時撤銷
- Telly 自己在 Cowork 對話貼了真實學生資料

**現況**：

- ✅ Cowork 對話遵循三紅線（已寫進記憶系統）
- ⚠️ 沒有員工密碼政策（強度 / 輪換）
- ❌ 沒有 2FA（雙因子認證）強制
- ❌ 沒有離職 SOP

**Phase A 後（持續）**：

- [ ] Supabase Dashboard 帳號**強制 2FA**（你自己先做）
- [ ] Vercel 帳號**強制 2FA**
- [ ] GitHub 帳號**強制 2FA**
- [ ] 1Password 或 Bitwarden 集中管理所有 keys
- [ ] 員工離職 SOP：當日撤銷所有帳號、24 小時內 rotation 共用 key
- [ ] 雇用第一個員工前：個資保密同意書簽署

**持續責任**：

- 季度檢視「誰有 Supabase / Vercel / GitHub 存取權」
- 季度跑「無效帳號清理」（90 天無登入的帳號 → 暫停）
- 雇人前先看本份 plan、簽 NDA

**失敗指標**：

- 🚨 任何 admin 帳號沒開 2FA
- 🚨 員工離職但帳號還能登入
- 🚨 PII 出現在 Slack / Email / Cowork 對話 / 任何聊天工具

---

## 4. 威脅模型（Threat Modeling）

針對每類威脅，列出**已有的防禦** + **若失守如何偵測 + 應變**。

### 威脅 4.1：加密金鑰外洩

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | Key commit 進 GitHub、員工貼 LINE、Cowork log、釣魚 |
| 已有防禦 | 第 3 層加密 + 第 9 層作業規範 + pre-commit hook |
| 偵測方式 | 員工自首、GitHub secret scanning、季度 audit |
| 應變 SOP | [`encryption-key-rotation-runbook.md`](./encryption-key-rotation-runbook.md) §2 |
| 通知義務 | 個資法第 12 條 — 通知家長 |

### 威脅 4.2：SQL Injection

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | 攻擊者透過表單欄位塞 SQL 字串繞過 RLS |
| 已有防禦 | Supabase client 預設用 parameterized query、Next.js Server Action 自動 escape |
| 偵測方式 | Supabase logs 異常 query、access_log 異常存取 |
| 應變 SOP | 撤銷洩漏者 token、查 logs 評估影響範圍、通知 |
| 補強 | 加 WAF（Vercel Pro 有 attack challenge mode） |

### 威脅 4.3：管理員帳號被盜（釣魚 / 共享電腦）

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | Phishing email、Telly 電腦被裝木馬 |
| 已有防禦 | 2FA（待開啟）+ 不固定 IP 限制 |
| 偵測方式 | 異常登入位置 / 時間、Supabase 登入 log |
| 應變 SOP | 立刻 force logout all sessions、改密碼、檢視 audit_logs |
| 補強 | Supabase Pro 啟用 IP allowlist（僅補習班 + 家用 IP） |

### 威脅 4.4：員工筆電遺失

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | 筆電被偷且有 Supabase Dashboard 已登入 / 有快取的 PII |
| 已有防禦 | session 自動過期、TLS 傳輸加密 |
| 偵測方式 | 員工主動回報 |
| 應變 SOP | 立刻 force logout 該員工所有 session、改該員工密碼、檢視最近 7 天 access_log |
| 補強 | 公司筆電強制磁碟加密（FileVault / BitLocker）、密碼鎖屏 5 分鐘 |

### 威脅 4.5：離職員工帶走資料

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | 離職前 export CSV、截圖、複製貼上 |
| 已有防禦 | access_log 紀錄、export 行為列為 audit event |
| 偵測方式 | 離職前 30 天的存取模式 review |
| 應變 SOP | 離職前 1 週收縮其權限、離職當日撤銷所有帳號、查 access_log 確認異常 |
| 補強 | 大量 export 設 rate limit + alert |

### 威脅 4.6：AI vendor 資料外洩

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | Anthropic / OpenAI 被駭 / 員工不當存取 |
| 已有防禦 | DPA + opt-out 訓練、家長同意書 |
| 偵測方式 | vendor 公告 / 訂閱 vendor security newsletter |
| 應變 SOP | vendor 出事立刻暫停該 AI 模組、通知家長、評估資料影響範圍 |
| 補強 | Phase A-D 期間不用 AI（v3.0 §5），8 月後再評估時更謹慎 |

### 威脅 4.7：Browser extension 攻擊

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | Telly 安裝惡意 Chrome 擴充功能 → 讀取 Supabase Dashboard 內容 |
| 已有防禦 | Chrome 內建惡意擴充偵測（不完美） |
| 偵測方式 | 異常存取 + 突然多出來的擴充功能 |
| 應變 SOP | 立刻 disable 可疑擴充、check Supabase login history、改密碼 |
| 補強 | 開發用獨立 Chrome profile，不裝任何沒在用的擴充 |

### 威脅 4.8：Backup 外洩

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | 你下載的 CSV backup（pre-flight 步驟）存放不當 |
| 已有防禦 | .gitignore 排除 backups/ 目錄 |
| 偵測方式 | 你自己 audit |
| 應變 SOP | 用 secure delete 砍掉、不要丟回收筒 |
| 補強 | backup 用後即刪、需保留就放加密的外接硬碟 |

### 威脅 4.9：開發階段意外暴露

| 項目 | 內容 |
|------|------|
| 攻擊路徑 | Telly 在 Cowork 對話貼真實學生姓名 debug、screenshot 含學生資料分享給朋友 |
| 已有防禦 | 三紅線授權原則（記憶 + v3.0 §13.2）|
| 偵測方式 | Telly 自我審查 |
| 應變 SOP | 對話清除、若已給第三方則通知對方銷毀 |
| 補強 | debug 一律用 anonymized fake data |

---

## 5. 預防 vs 偵測 vs 應變

任何 PII 防護都需要三個時間軸並行：

| 軸 | 目標 | Tom Bear 落實 |
|----|------|--------------|
| **預防（Preventive）** | 避免事件發生 | 第 1-9 層大部分 |
| **偵測（Detective）** | 事件發生時知道 | access_log 監控 + Supabase log + Sentry |
| **應變（Responsive）** | 事件發生後止血 + 通報 | key rotation runbook + 通知範本 |

**常見錯誤**：只做預防（加密、RLS），不做偵測（沒人看 log），結果出事 3 個月後才知道。

---

## 6. 個資外洩應變 SOP（一頁版）

詳細版見 [`encryption-key-rotation-runbook.md`](./encryption-key-rotation-runbook.md) §6。這裡是簡化版：

```
0. 不要慌（事故處理 90% 的失敗來自慌）

1. 立刻評估範圍（30 分鐘內）
   - 哪些資料？多少筆？影響哪些當事人？
   - 是已外洩 or 可能外洩？
   - 攻擊者是否仍能存取？

2. 立刻止血（1 小時內）
   - 撤銷可能洩漏的 token / key
   - 必要時暫停服務（接受短期 downtime > 持續外洩）

3. 律師諮詢（24 小時內）
   - 通知義務的範圍與時效
   - 對外溝通的措辭

4. 通知當事人（個資法要求 — 通常 72 小時內）
   - 用 §6.6 通知範本
   - 同時 email + 系統公告 + 重要案例 phone call

5. 通報主管機關（視情況）
   - 重大事件可能需通報「個人資料保護委員會」

6. 事後檢討（1 週內）
   - Incident report 存進 docs/incidents/
   - 修補流程漏洞

⚠️ 「先處理事件本身、再處理通知」是錯的。
    台灣個資法要求**及時**通知，拖延會加重罰責。
```

---

## 7. 季度檢視流程

每 3 個月（建議 1/1、4/1、7/1、10/1）跑一次：

### 7.1 技術面 review（30 分鐘）

- [ ] 跑 SSL Labs 看 grade 還是 A
- [ ] 看 Supabase 異常 query / 大量讀取
- [ ] 看 access_log 統計：誰存取最多？是否合理？
- [ ] 看 unused PII 欄位：有沒有可以 drop 的
- [ ] 看「結業 5+ 年的學生」名單：觸發資料銷毀流程

### 7.2 人員面 review（30 分鐘）

- [ ] 列出所有 Supabase / Vercel / GitHub 帳號
- [ ] 確認每個帳號還在職、還需要、有 2FA
- [ ] 撤銷不需要的權限
- [ ] 看離職員工帳號（應已撤銷）

### 7.3 法律面 review（30 分鐘 - 半年一次也可）

- [ ] 同意書版本是否需更新
- [ ] 新增 AI vendor / 第三方服務的 DPA 是否簽好
- [ ] 個資法 / 兒少法是否有新修法影響

### 7.4 應變演練（每年一次）

模擬一次「假裝 encryption key 外洩」：

- 確認 key rotation runbook 仍有效
- 確認通知範本仍合宜
- 找出流程上的漏洞 → 更新 runbook

---

## 8. 未來雇員的個資教育訓練

當你雇用第一個合作夥伴 / 員工時，必做：

### 8.1 第一天 onboarding（2 小時）

- [ ] 給他看本文件
- [ ] 給他看 [`encryption-key-rotation-runbook.md`](./encryption-key-rotation-runbook.md)
- [ ] 給他看 v3.0 §6 個資合規
- [ ] 給他看 backend-conventions.md §1 三紅線
- [ ] 簽 NDA（保密協議 — 律師起草）
- [ ] 給他 1Password 帳號 + 必要的 keys

### 8.2 第一週訓練（每天 30 分鐘）

- Day 1：個資法基礎（個資定義、蒐集目的、家長權利）
- Day 2：本系統的 PII 欄位清單（§2.2）
- Day 3：九層防禦架構（§3）
- Day 4：威脅模型（§4）
- Day 5：應變 SOP（§6）

### 8.3 持續教育

- 每季一次 30 分鐘 brown bag「最近的個資事件 + 我們學到什麼」
- 每年一次完整 refresh

---

## 9. 合規對照表

### 9.1 個資法（個人資料保護法）

| 條文 | 要求 | 我們的實踐 |
|------|------|----------|
| 第 5 條 | 蒐集應有特定目的 | 同意書明示 4 個目的 |
| 第 8 條 | 蒐集時應告知 | 同意書 + onboarding 流程告知 |
| 第 10 條 | 當事人有查詢、更正權 | `/help/data-request` 頁面（Phase A 第 3 週建立） |
| 第 11 條 | 利用目的消失應刪除 | 結業 5 年後 trigger 銷毀流程 |
| 第 12 條 | 外洩需通知當事人 | §6 應變 SOP |
| 第 21 條 | 國際傳輸需告知 | 同意書「AI 服務商處理」條款 |
| 第 27 條 | 安全維護義務 | 本文件第 3 層至第 9 層 |

### 9.2 兒少法（兒童及少年福利與權益保障法）

| 條文 | 要求 | 我們的實踐 |
|------|------|----------|
| 第 70 條 | 兒少個資特別保護 | RLS + 加密 + 12 歲以下資料加倍嚴格 |
| 第 69 條 | 不得揭露足以識別之資訊 | operational_events 嚴禁 PII (§4 禁止清單) |

### 9.3 教育部補習班管理辦法

| 要求 | 我們的實踐 |
|------|----------|
| 學員資料保密 | 加密 + RLS + access_log |
| 學員資料保存期限 | 學員結業後 5 年銷毀 |
| 接受主管機關檢查 | access_log + audit_logs 提供完整紀錄 |

---

## 10. 對應 Phase A-D + AI 化的時程

| Phase | 對應本文件章節的執行 |
|-------|--------------------|
| Phase A 第 1 週 | 第 2 層（schema 清理）、第 5 層（RLS）建置 |
| Phase A 第 2 週 | 第 5 層（RLS policies）+ 第 6 層（access_log） |
| Phase A 第 3 週 | 第 1 層（同意書）+ 第 3 層（加密）+ 第 6 層（log）完整上線 |
| Phase B | 第 7 層（output sanitization）code refactor |
| Phase C | 第 9 層（人員作業規範）演練 |
| Phase D | 第 8 層（DPA 樣板） + 完整應變演練 |
| 2026-08 AI 化前 | 第 8 層（AI vendor DPA）必做 |
| 第一個外部客戶 | 第 8 層（客戶 DPA）+ 個資保險評估 |

---

## 11. 失敗指標總表（紅線 — 任一發生立刻檢討）

| 失敗指標 | 對應層級 |
|---------|---------|
| 任何 PII 欄位未加密 | 第 3 層 |
| 任何業務表 RLS = disabled | 第 5 層 |
| PII 讀取但無 access_log | 第 6 層 |
| Encryption key 出現在 git / log / 訊息 | 第 3 + 9 層 |
| Admin 帳號沒開 2FA | 第 9 層 |
| API response 內含未過濾的加密欄位 | 第 7 層 |
| 結業 5+ 年的學生資料還在 | 第 2 層 |
| 沒簽同意書的家長資料在系統中 | 第 1 層 |
| 未簽 DPA 接的第三方服務 | 第 8 層 |
| 任一 endpoint 走 HTTP | 第 4 層 |

---

## 12. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |

---

**文件結束**

> 個資外洩是補教產業最容易發生、最難挽回的事故類型。本文件九層架構與其說是「規範」，不如說是「保險」— 你買的不是預防一次性事故，而是把整體事故發生機率從 10% 降到 0.1%。
