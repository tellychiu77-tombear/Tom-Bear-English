# Week 0 技術決議與商業願景紀錄

> **文件性質**：Phase A 開工前（第 0 週，5/8-5/10）拍板的決議集合
> **用途**：所有後續開發、合約、行銷、研究發表的最高優先級規範文件
> **版本**：1.0
> **日期**：2026-05-08
> **維護人**：Telly + Claude（透過協作流程，見 v3.0 報告第 13 章）
> **引用**：[Tom_Bear_AI化優化報告_v3.0.md](../Tom_Bear_AI化優化報告_v3.0.md)
> **檔案位置**：`mom-call-app/docs/week0-tech-decisions.md`

---

## 目錄

0. [商業願景（內部版）](#0-商業願景內部版)
1. [五個技術決議](#1-五個技術決議)
2. [設計原則第 8 條：每個 UI 都是觀察儀器](#2-設計原則第-8-條每個-ui-都是觀察儀器)
3. [協作原則：持續精進](#3-協作原則持續精進)
4. [Stealth 模式規範](#4-stealth-模式規範)
5. [Action Items](#5-action-items)
6. [文件維護](#6-文件維護)

---

## 0. 商業願景（內部版）

> ⚠️ 本節為**內部視野**，stealth 階段不對外公開。對外文案請參考 v3.0 報告第 1.2 節。

### 0.1 全景

```
平台層（你的 SaaS 公司）：
  Intelligent Kids（暫定名稱）
       ↓
旗下品牌：
  ├── 湯貝爾（Tom Bear，Telly 自家補習班，第一個 tenant，dogfooding 場域）
  ├── 加盟客戶 A
  ├── 加盟客戶 B
  └── ...

商業核心：
  軟體本身 = 訂閱收入（其中一個收入來源）
  操作數據 = 研發護城河（用來建立教育流派）
  補教實務經驗 = 差異化來源

長期定位：
  Telly = 從補教實務出身的「實體派」教育思想家
  類比：華德福（Steiner）、蒙特梭利、瑞吉歐
  目標：建立屬於自己的教育流派 + 培訓體系 + 講師事業
```

### 0.2 三條平行軌道

不只是 SaaS 創業者，Telly 的成功路徑包含三條平行軌道：

| 軌道 | 說明 | 12 個月目標 | 24 個月目標 | 60 個月目標 |
|------|------|-------------|-------------|-------------|
| **A. 軟體訂閱** | 短期現金流 | 自家用穩 + 1-2 試用 | 3-5 家付費 | 10-30 家付費 |
| **B. 研究素材累積** | 中期護城河 | 12 個月跨季操作數據完整 | 第一份產業 benchmark 報告（內部） | 公開發表 / 出版 |
| **C. 實體派教育流派** | 長期定位 | （stealth）私人觀察筆記累積 | （stealth）流派理論初稿 | 對外發表 / 培訓體系啟動 |

**關鍵認知**：軌道 A 不是唯一成功標準。即使 SaaS 收入慢，只要軌道 B 數據持續累積、軌道 C 筆記持續產出，整體商業價值仍在累積。

### 0.3 Stealth 模式

**對外（客戶 / 家長 / 行銷文案 / 公開頁面）**：

> 「Tom Bear / Intelligent Kids 是一套 AI 強化的補教校務系統，匿名統計資料用於系統改善與教育研究。」

**對內（Telly + Claude + 未來夥伴）**：

> 「此平台是 Telly 未來教育流派（暫名「實體派」）的觀察儀器。每個 UI 設計都同時是研究工具，現階段先 stealth 累積資產，公開時機由 Telly 決定，不為外部壓力提前。」

### 0.4 「實體派」暫定名

**來源**：Telly 從多年補教實務累積、區別於主流教育學派的觀察理論。

**正式名稱**：待 Telly 心中浮現後更新，目前佔位符 = 「實體派」。

**Archetype 對照**：

| 創始人 | 學歷背景 | 起點 | 核心方法 |
|--------|----------|------|----------|
| Rudolf Steiner（華德福） | 自然科學 PhD，但非教育學者 | 為工廠工人子女辦學校 | 「人智學」觀察框架 |
| Maria Montessori | 醫生，非教育學者 | 觀察智能障礙兒童 | 臨床觀察方法 |
| Loris Malaguzzi（瑞吉歐） | 一般教師 | 戰後義大利幼兒園 | 「兒童的一百種語言」實踐 |
| **Telly（實體派）** | 大學畢業 + 多年補教實務 | 自家補習班 | 待系統化（透過操作數據觀察 + 私人筆記） |

**共同 pattern**：實踐者觀察 → 系統理論 → 文字化 manifesto → 培訓老師 → 體系散布。Telly 目前在第一個動作的早期。

### 0.5 Telly 自身陳述（原文）

> 「我想利用自己這一套『實體派』的理論，建立一個類似華德福或蒙特梭利那樣的體系。這是屬於我自己的東西，我可以擔任講師、負責培訓或宣導我的理念。雖然這帶有理想性質的宣傳，但背後一定也會穿插一些商業元素。」
>
> 「關於報告的部分，我希望你在設計的過程中，不只是設計 UI 或功能，更重要的是我們要討論如何設計這些東西，好讓所有的體驗與操作流程都方便提取數據。」
>
> 「目前我不會在 Podcast 之類的平臺演講。我並非永遠不去，而是想等到有一個明確的方向、概念也整合完成後，我才會對外發表。」
>
> — 對話原文，2026-05-08

---

## 1. 五個技術決議

### 決議 1：Tenant 隔離方式 = Path-based

**選擇**：Path-based（同一網域，路徑區分客戶）

**範例**：
```
[平台網域]/tombear/...      ← Telly 自家
[平台網域]/clientB/...      ← 第二家加盟
[平台網域]/clientC/...      ← 第三家加盟
```

**為什麼選這個**：

1. 工作量低（1-2 天），留時間給個資合規
2. DNS / SSL 完全不動，省去 wildcard 設定
3. Next.js 的 `[tenant]` 動態路由原生支援
4. **與 Intelligent Kids 旗下加盟模式直譯吻合**：URL 顯示「客戶屬於平台」反而強化了商業定位
5. 未來可並存 subdomain（Pro 方案功能），路不堵死

**考慮過但未選的選項**：

- **Subdomain**（`tombear.[平台]`）：工作量中（3-5 天）、需 wildcard DNS+SSL；可作為未來 Pro 方案加值
- **不分 URL**：工作量最低但 URL 不可分享、debug 跨 tenant 困難，不推薦

**未來重新評估訊號**：

- 🚨 已有 3+ 付費客戶且 1+ 明確要求 subdomain → 加 Pro 方案（subdomain + path 並存）
- 🚨 大客戶願意付 2-3 倍價格換白標 → 加 Enterprise 方案（CNAME 到客戶自有網域）
- ❌ 不需重評：客戶說「URL 看起來不夠專業」（補教系統都是內部使用，無關品牌）

---

### 決議 2：tenant_id 存放位置 = JWT custom claim

**選擇**：JWT custom claim（透過 Supabase Auth Hook 自動寫入 token）

**RLS Policy 範例**：
```sql
CREATE POLICY students_tenant_isolation_select ON students
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

**為什麼選這個**：

1. RLS policy 一行就能取值，效能最好
2. 不需 DB JOIN（每筆查詢省一次 IO）
3. 平台規模化必經之路 — 5 家、10 家客戶時的效能差異會明顯
4. Auth Hook 學習曲線約 1 天，是值得的投資

**考慮過但未選的選項**：

- **app_metadata**（`auth.users.app_metadata.tenant_id`）：設定簡單但 RLS 寫法稍繁、屬非標準路徑
- **DB JOIN 每次**（`SELECT users WHERE id = auth.uid()` in policy）：完全不動 JWT 但每筆查詢多一次 JOIN，規模大會痛

**已知未來會遇到的小問題與應對**：

| 問題 | 應對 | 一次 vs 反覆 |
|------|------|-------------|
| 改 tenant 後使用者要重登才生效 | 後台改 tenant 時跳出「強制登出」選項 | 一次性 UI 設計 |
| 背景 cron job 沒有 JWT | 用 service_role key + 顯式 tenant_id 限制；建立 `docs/backend-conventions.md` 規範 | 一次性建立規範 |
| 平台管理員（Telly）想跨 tenant 看資料 | RLS 多寫一條 `platform_admin` 特權 policy | 一次性建立 |

**未來重新評估訊號**：

- 🚨 使用者數達 1 萬+，JWT 變大導致每次 request 帶大量資料 → 改 session DB 模式
- 🚨 決定離開 Supabase 自架後端 → Auth Hook 邏輯需重寫
- ❌ 不需重評：偶爾有人抱怨「改 tenant 沒立刻生效」（這是設計取捨）

---

### 決議 3：敏感欄位加密 = pgcrypto

**選擇**：PostgreSQL pgcrypto extension，key 存 Supabase Vault

**加密欄位範圍**：

- 學生中文姓名、英文姓名
- 家長姓名、電話、地址
- 學生身分證字號（如有）
- 家長身分證字號（如有）
- 健康資料、過敏資訊

**Schema 範例**：
```sql
-- 加密欄位用 BYTEA（加密後二進位）
ALTER TABLE students 
  ADD COLUMN chinese_name_encrypted BYTEA,
  ADD COLUMN parent_phone_encrypted BYTEA;

-- 寫入時加密
INSERT INTO students (chinese_name_encrypted, ...) 
VALUES (pgp_sym_encrypt('王小明', current_setting('app.encryption_key')), ...);

-- 讀取時解密（後端 service_role 才能呼叫）
SELECT pgp_sym_decrypt(chinese_name_encrypted, current_setting('app.encryption_key')) 
FROM students;
```

**為什麼選這個**：

1. PostgreSQL 原生，效能好
2. 文件成熟、業界範例多
3. 工作量適中（2-3 天），符合 Phase A 第 3 週時程
4. Supabase Vault 雖然進階但仍在 alpha，不適合生產環境根基

**考慮過但未選的選項**：

- **Supabase Vault + pgsodium**：業界最佳實踐、支援 key rotation，但 alpha 階段、文件少、學習曲線高
- **應用層 envelope encryption**：DB 中立、最高彈性，但**自己寫加解密極容易出 bug**，效能差

**已知未來會遇到的問題與應對**：

| 問題 | 應對 | 何時建立 |
|------|------|----------|
| 加密欄位無法搜尋 | 為要搜尋的欄位加 `_search_hash` 欄（HMAC-SHA256），用 hash 等值比對 | Phase A 第 3 週一起建 |
| 家長要求查看自家資料（個資法權利） | 後台「個資查詢請求」頁，主管才能觸發解密 + 產出 PDF | Phase A 第 3 週 |
| Key 外洩（人為錯誤 commit 進 GitHub） | 三層防護：Vault 存 key + .gitignore + pre-commit hook | Phase A 第 3 週設計 |
| 解密效能拖累（10 萬+ 加密筆數） | 只加密「真正敏感」欄位（不要全表加密）；列表頁用 view 預先解密該 tenant 範圍 | 真的瓶頸時優化 |

**未來重新評估訊號**：

- 🚨 客戶數 10+ 家、單表加密資料 10 萬+ 筆，效能拖累 → 升級 Supabase Vault + pgsodium（屆時應已 GA）
- 🚨 法規升級要求「per-tenant 獨立加密 key」（目前個資法沒這要求） → 改 envelope encryption
- ❌ 不需重評：覺得 pgcrypto「不夠 fancy」（業界 80% 中小型 SaaS 都用這個）

---

### 決議 4：資料分層架構 = 雙資料池雙軌設計（v3.0 新增）

**選擇**：兩個資料池從 day 1 切乾淨

| 資料池 | 內容 | 加密 | 跨 tenant 可見 | 商業用途 |
|--------|------|------|---------------|----------|
| 🔴 **PII 池** | 學生姓名、家長電話、地址、身分證、健康資料 | ✅ pgcrypto 加密 | ❌ 永不跨 tenant | 不能用，純合規 |
| 🟢 **操作事件池** | 行為事件（誰、何時、做了什麼操作） | ❌ 不加密（已匿名） | ✅ Telly 可跨 tenant 分析 | 研究護城河 |

**操作事件池的關鍵設計**：寫入時就匿名化。

❌ **不要這樣寫**（含可識別資訊）：
```json
{
  "user": "林媽媽",
  "student_name": "林小明",
  "action": "open_contact_book",
  "timestamp": "2026-05-15 14:23:00"
}
```

✅ **這樣寫**（已匿名 + research-grade 結構）：
```json
{
  "tenant": "tombear",
  "user_role": "parent",
  "student_age_band": "8-9",
  "student_class": "CEI-A",
  "action": "open_contact_book",
  "prior_action": "open_dashboard",
  "time_since_prior": 12,
  "session_id": "anon_uuid_xxx",
  "timestamp": "2026-05-15 14:23:00"
}
```

**為什麼這樣切**：

1. **法律上**：個資從未離開 tenant 邊界 → 完全合規（個資法 + 兒少法）
2. **商業上**：Telly 能跨 tenant 看「老師最常用什麼功能」「哪些 feature 留存率最高」「行為模式預測續班」 → 軌道 B 研究素材
3. **避開 Google/Facebook 模式的法律風險**：在台灣對未成年人資料用同意書「Google 化」會踩雷；改用「匿名研究」路徑反而更乾淨

**對應 schema 設計**：

```sql
-- Phase A 第 1 週要建立的 operational_events 表（research-grade）
CREATE TABLE operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),  -- 為了跨 tenant 查詢時聚合
  
  -- 事件本身
  event_type VARCHAR(100) NOT NULL,  -- 'open_contact_book', 'fill_observation', etc.
  event_payload JSONB DEFAULT '{}',  -- 結構化欄位（已匿名）
  
  -- 行為脈絡（research-grade 維度）
  user_role VARCHAR(50),             -- 'teacher', 'parent', 'admin'
  user_anon_id UUID,                 -- 匿名 ID（不可回推學生）
  prior_event_type VARCHAR(100),     -- 上一個動作（行為序列研究）
  time_since_prior_ms INT,           -- 距離上一動作的毫秒數
  session_id UUID,                   -- session 級匿名 ID
  
  -- 上下文標籤（協助分析但不識別個人）
  class_anon_code VARCHAR(50),       -- 班別匿名代碼
  age_band VARCHAR(20),              -- '6-7', '8-9', '10-11'（不存實際生日）
  
  -- 時間
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_op_events_tenant_event ON operational_events(tenant_id, event_type);
CREATE INDEX idx_op_events_session ON operational_events(session_id, created_at);
```

**配套產物**：`docs/data-dictionary.md`（Phase A 第 1 週建立，記錄每個 event_type 的擷取時機、結構化欄位、潛在研究問題）。

---

### 決議 5：商業模式擱置至 Phase D

**選擇**：暫不決定純 SaaS / 加盟 / 研究合作社模式

**原因**：

1. 三種模式的合約結構、定價、法律規範**完全不同**
2. 在 Phase A-D（自家封測）期間**不影響開發進度**
3. 接觸第一批外部客戶前才需要決定（約 2026 年底 ~ 2027 年初）

**屆時要展開比較的三個方向**：

| 模式 | 客戶得到什麼 | 你得到什麼 | 法律風險 |
|------|--------------|-----------|----------|
| **純 SaaS 訂閱** | 一套軟體 | 訂閱費 | 低，但數據用途受限 |
| **虛擬加盟（軟體加盟）** | 品牌 + 系統 + 規範 | 加盟金 + 權利金 | 受公平交易法管，重 |
| **研究合作社**（推薦傾向） | 軟體 + 產業 benchmark 報告 | 訂閱費 + 合法數據使用權 | **最低**（研究目的明文允許） |

**Phase D 前要先做的準備**：

- 累積 4 週自家封測的真實 baseline 數據
- 先擬一份「研究合作社模式」的合約初稿
- 諮詢熟悉教育產業的律師（NT$15,000-50,000）

---

## 2. 設計原則第 8 條：每個 UI 都是觀察儀器

> 來自 Telly 的洞察（2026-05-08）：「我希望你在設計的過程中，不只是設計 UI 或功能，更重要的是我們要討論如何設計這些東西，好讓所有的體驗與操作流程都方便提取數據。」

### 規則

任何 UI 改動的設計討論，**必須同時通過兩個視角審核**：

- **使用者視角**：流程順手嗎？老師家長理解嗎？文案清楚嗎？
- **觀察者視角**：能擷取什麼行為訊號？訊號能回答什麼研究問題？

### 設計 Checklist（每個新功能上線前必跑）

| # | 問題 | 範例（聯絡簿心情評分） |
|---|------|------------------------|
| 1 | 這個 UI 元件捕捉什麼行為？ | 老師對孩子當天情緒的判讀 |
| 2 | 是否結構化？（避免自由文字） | ✅ 1-5 星評分，❌ 「老師對心情的描述」（free text） |
| 3 | 能跟其他訊號交叉嗎？ | ✅ 心情 × 出席率 × 家長閱讀時間 = 研究素材 |
| 4 | 寫進 `operational_events` 了嗎？ | 必須 |
| 5 | 未來能回答什麼研究問題？ | 「週幾的孩子情緒最低落？」「下雨天 vs 晴天的專注力差異？」 |

**通不過第 5 題的功能** — 也就是「設計時想不到能回答什麼研究問題」 — 應該再思考是否真的需要做，或是否該重新設計擷取方式。

### 配套產物

- `docs/data-dictionary.md`（Phase A 第 1 週建立）：每個事件 / 欄位的條目格式：

```markdown
## event: fill_observation
**捕捉時機**: 老師按下「儲存」聯絡簿時
**結構化欄位**: 
  - mood (1-5)
  - focus (1-5)
  - participation (1-5)
  - expression (1-5)
  - lesson_topic (text, but with topic taxonomy)
  - homework_length_chars (computed)
  - public_note_length_chars (computed)
  - time_to_complete_seconds (computed)
**行為脈絡**:
  - prior_event_type
  - time_since_prior_ms
**潛在研究問題**: 
  - 老師寫聯絡簿的時間長短與品質相關嗎？
  - 心情/專注度評分模式跨補習班有共通性嗎？
  - 哪些評分組合預測學生續班？
```

### 與 v3.0 報告的對應

對應 v3.0 報告第 2 章「核心策略原則」第 8 條。本文件是該原則的詳細展開。

---

## 3. 協作原則：持續精進

> Telly 主張（2026-05-08）：「每一次我們在修改、每一次在做這個挑戰的時候，我們都要討論，盡量把它做到極致。」

### 三條規則

1. **任何修改前必須先討論做法**（依 v3.0 報告第 13 章 5 步 loop），不接受「直接做、做完再說」
2. **每個版本追求「目前條件下能做到的最好版本」**，而不是「能跑就好」
3. **不接受「先這樣將就」的妥協心態**，除非：
   - 有明確的時程壓力（例如封測 deadline 前 3 天）
   - 妥協內容**必須記錄在案**（PR description / commit message / 對應文件加註「TODO: 因 X 暫時妥協，預計 Y 時機回來精修」）

### 適用範圍

✅ **必須走「精進」流程**：
- 所有 UI / UX 設計
- 所有資料庫 schema 改動
- 所有 prompt 設計（AI 化階段）
- 所有對外文案（家長 / 老師看到的字）
- 所有合約 / 法律相關文件

❌ **不需大討論，但仍要做好**：
- 純粹的 typo 修正
- 純粹的 lint / format 整理
- 第三方套件版本升級（無 breaking change）

### 授權原則：三條紅線（Telly 設立 2026-05-08）

持續精進原則之外，Telly 另設了一條更明確的「自主 vs 確認」分界：

Claude 可自主執行任何動作，**除非**觸及三條紅線：💰 產生費用、💥 系統癱瘓、🔓 洩漏個資。觸及 → 先確認；不觸及 → 自主做、做完告知。

完整定義與對照表見 v3.0 報告第 13.2 節。

### 與 v3.0 報告的對應

- 持續精進原則 → 對應 v3.0 報告第 13.6 節
- 授權三紅線 → 對應 v3.0 報告第 13.2 節

本節是這兩項規範的展開記錄。

---

## 4. Stealth 模式規範

### 對外（客戶 / 家長 / 行銷文案 / 公開頁面）

只講：

> 「Tom Bear / Intelligent Kids 是一套 AI 強化的補教校務系統，匿名統計資料用於系統改善與教育研究。」

**不講**：實體派、教育流派、講師事業、跨補習班數據用途的細節。

### 對內（Telly + Claude + 未來夥伴）

完整圖見本文件第 0 節「商業願景」。

### 公開時機

由 Telly 決定。**不為以下原因提前**：

- 客戶要求看「研究內容」
- 同業好奇你在做什麼
- 投資人問「你的長期願景」

可以的回覆：「我們專注於把目前的軟體產品做好，研究面屬於內部累積。」

### 對 Phase D 推銷的影響

封測完到 Phase D 之間，對外推銷時只強調：

- ✅ 對老師：「省你寫聯絡簿、回家長訊息的時間」
- ✅ 對家長：「你看得到孩子每日成長紀錄」
- ✅ 對補習班老闆：「省下的老師時間 = 多收一個學生 = 月增 NT$20,000」
- ❌ **不講**：「你們會成為我研究的一部分」

到對外公開階段（軌道 C 啟動，可能 2028 年以後），才把研究面端上檯面。

---

## 5. Action Items

### 第 0 週剩餘（5/9-5/10，本週末）

- [x] 三個技術決議拍板（決議 1, 2, 3）
- [x] 三個衍生決議成形（決議 4, 5；設計原則 8；持續精進原則）
- [x] v3.0 報告同步更新（0.6, 1.5, 第 2 章原則 8, 6.2, 12.2.1, 13.6）
- [x] 本文件 `week0-tech-decisions.md` 建立
- [x] `private-research/實體派觀察筆記.md` 草檔建立
- [x] `.gitignore` 加 `private-research/` 排除
- [ ] **Telly：21 個 page 走查**（需要 Telly 配合 60-90 分鐘）
- [ ] **Telly：Supabase schema dump**（需要 Telly 跑指令 + 貼結果）

### Phase A 第 1 週（5/11-5/17）

- [ ] schema 設計：tenants 主表 + tenant_id 全表
- [ ] **schema 設計：PII 池（加密）/ 操作事件池（不加密）切清楚**
- [ ] **建立 `operational_events` 表（research-grade 結構，含行為脈絡欄位）**
- [ ] **建立 `docs/data-dictionary.md`**
- [ ] users 表加 tenant_id + role
- [ ] 自家補習班建為 tenant 0001

### Phase A 第 2 週（5/18-5/24）

- [ ] 所有業務表加 tenant_id 欄位 + 索引
- [ ] Supabase Auth Hook 設定 tenant_id custom claim
- [ ] 為每張表寫 RLS policies（含 platform_admin 特權）
- [ ] 修改 app/ 中所有 query
- [ ] e2e 隔離測試（tenant B 看不到 tenant A）

### Phase A 第 3 週（5/25-5/31）

- [ ] pgcrypto 加密欄位實作（學生姓名、家長電話、身分證、健康資料）
- [ ] `_search_hash` 欄位（讓加密欄位可搜尋）
- [ ] **個資同意書草稿**（含「特別重要 1」AI 服務商揭露 + 「特別重要 2」研究目的揭露）
- [ ] access_log 表 + middleware
- [ ] 「個資查詢請求」後台頁
- [ ] HTTPS 全站驗證

### Phase D（7/27-8/2）— 後期再決定

- [ ] 商業模式拍板：純 SaaS / 軟體加盟 / 研究合作社
- [ ] 律師諮詢（合約樣板審核）
- [ ] 個資保險評估

---

## 6. 文件維護

### 更新規則

- 本文件為「決議」紀錄，**決議改變才更新**，不為小細節更新
- 每次更新需在最下方加一條「變更日誌」條目
- 更新前需走 v3.0 報告第 13 章協作流程（即先討論再執行）

### 與 v3.0 報告的關係

| 文件 | 性質 | 內容 |
|------|------|------|
| v3.0 報告 | 對外可讀的策略藍圖（含 stealth 邊界後的版本） | 含 0.6 stealth 定義、1.5 個人定位指引、原則 8、12.2.1 三軌道、13.6 持續精進 |
| 本文件 | 內部詳細記錄 | 含 0 商業願景全文、決議 1-5 完整理由、原則 8 完整 checklist、持續精進完整規範、Action Items |

關係：v3.0 報告 = 摘要 + 對外可分享版本；本文件 = 完整版 + 純內部。

### 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 建立，含 5 決議 + 設計原則 8 + 持續精進原則 + 商業願景內部版 | Telly + Claude |

---

**文件結束**

> 任何閱讀本文件的 AI 工具或人類，請先閱讀 v3.0 報告第 0 章「方向轉向紀錄」與第 13 章「協作流程」，再讀本文件作為內部詳細展開。
