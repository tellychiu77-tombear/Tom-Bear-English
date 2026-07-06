# Quarterly Review Template — 季度檢視標準範本

> **目的**：把分散在 12+ 份文件裡的「需要定期檢查」事項，整合成可重複執行的季度 ritual。每 3 個月跑一次，1-2 小時內完成，確保所有 SOP / 監控 / 合規 / 商業指標不會慢慢失效。
> **撰寫日期**：2026-05-27（Telly 回國後）
> **適用範圍**：Phase A 完成後就生效，後續每季執行
> **規範來源**：[`pii-protection-plan.md`](./pii-protection-plan.md) §7、[`disaster-recovery-runbook.md`](./disaster-recovery-runbook.md) §10、[`launch-to-market-plan.md`](./launch-to-market-plan.md) §9.1
> **預估執行時間**：第一次 3 小時、之後每次 1-2 小時
> **建議執行日期**：每年 1/1、4/1、7/1、10/1（或最接近的工作日）

---

## 0. 為什麼需要季度檢視

### 0.1 「自然衰退法則」

所有 SOP / 監控 / 流程都會「自然衰退」：

- 監控 alert 沒人看 → 出事時也不知道
- 員工權限沒清理 → 離職員工仍能登入
- 個資合規同意書版本舊 → 法律不認
- 加密 key 沒輪換 → 一旦外洩無止血
- 競品在進化 → 你的優勢慢慢消失
- 客戶在流失 → 不主動關懷就掉了

**單一防禦的衰退率：每月約 5-10%**。3 個月不檢查，一半防禦已失效。季度檢視就是「重新校準」。

### 0.2 與其他文件的關係

```
本範本是「執行層」，串接以下「規範層」文件：
├── pii-protection-plan.md §7（9 層防禦的季度檢視）
├── disaster-recovery-runbook.md §10（backup 完整性驗證）
├── encryption-key-rotation-runbook.md（key 輪換時機）
├── launch-to-market-plan.md §9（客戶流失預警）
├── phase-c-beta-test-protocol.md（封測期間每週 check）
└── data-dictionary.md（事件字典維護）
```

季度檢視不重寫上述文件，只是「依清單跑一次、紀錄結果、發現問題就回去翻對應 runbook」。

---

## 1. 執行週期建議

### 1.1 標準週期

| 時機 | 適合做 |
|------|--------|
| **1 月初** | 含「跨年度檢視」— 一年的累積數據總結 |
| **4 月初** | 標準季度檢視 |
| **7 月初** | 含「上半年回顧」 |
| **10 月初** | 含「對來年規劃」 |

### 1.2 第一次執行建議

如果你是第一次跑這個範本：

- 排 **3 小時**（不是 1 小時 — 第一次要 fill in all the blanks）
- 找安靜時段（不在補習班開課時段）
- 結束時把成果寫進 `docs/quarterly-reviews/YYYY-QN.md`

第二次起每次 1-2 小時。

### 1.3 變動觸發的「臨時檢視」

正常季度之外，發生以下事件**必須**啟動臨時檢視：

- 加密金鑰外洩 / 疑似外洩
- Production schema 大幅變動（例如 Phase A 完成）
- 員工離職 / 新雇用
- 法規重大變動（個資法 / 兒少法修法）
- Supabase / Vercel 重大事故
- 簽進 / 流失客戶（第 5 個之後）

---

## 2. 三大檢視維度概覽

每次季度檢視都涵蓋這 3 個維度，**不可省略任一**：

| 維度 | 看什麼 | 預估時間 |
|------|-------|---------|
| 🔧 **技術面** | 監控、效能、安全、備份完整性 | 30-45 分鐘 |
| 👥 **人員面** | 權限、訓練、流程紀律 | 20-30 分鐘 |
| 📊 **商業/合規面** | 客戶健康、財務、法律合規 | 30-45 分鐘 |

---

## 3. 🔧 技術面季度 Checklist

### 3.1 監控（5 分鐘）

- [ ] **UptimeRobot 上月 uptime > 99.5%**？低於就要查為什麼
- [ ] **`/api/health` endpoint 仍正常運作**？打開瀏覽器試一次
- [ ] **Sentry / 錯誤監控有訂閱 email**？email 沒爆滿？
- [ ] **Supabase Dashboard 沒紅燈警報**？

### 3.2 效能（10 分鐘）

- [ ] **首頁載入時間** < 3 秒（用 Chrome DevTools Lighthouse 測一次）
- [ ] **學生列表頁載入** < 2 秒（即使解密 152 學生）
- [ ] **聯絡簿填寫送出** < 1 秒
- [ ] **加密欄位搜尋** < 500ms

如果哪項變慢 → 看 Supabase Dashboard → Queries → 找慢 query。

### 3.3 安全（15 分鐘）

跑 `pii-protection-plan.md` §11 失敗指標清單：

- [ ] 任何 PII 欄位未加密？（schema audit 應該清零）
- [ ] 任何業務表 RLS = disabled？
- [ ] PII 讀取但無 access_log 紀錄？
- [ ] Admin 帳號沒開 2FA？
- [ ] API response 內含未過濾的加密欄位？

跑 SSL Labs 測 [https://www.ssllabs.com/ssltest/](https://www.ssllabs.com/ssltest/)：

- [ ] grade 仍為 **A 以上**

### 3.4 Backup 完整性（10 分鐘 — 半年驗證 1 次完整 restore）

- [ ] Supabase Dashboard → Backups 顯示最近 7 天每天都有
- [ ] 月份的「dry-run restore」（每半年 1 次）— 紀錄結果

### 3.5 Key 與憑證（5 分鐘）

- [ ] `app_encryption_key` 上次輪換在 1 年內？
- [ ] `app_hash_key` 上次輪換在 1 年內？
- [ ] SSL 憑證距到期 > 30 天？
- [ ] 網域距續約 > 60 天？

### 3.6 Schema 與資料品質（10 分鐘）

- [ ] 跑下面 SQL，看有沒有意外的新表 / 欄位：

```sql
-- 找出最近 30 天內被 ALTER 的表
SELECT table_name, MAX(updated_at) AS last_change
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY last_change DESC NULLS LAST
LIMIT 10;
```

- [ ] 跑下面 SQL，看「結業 5+ 年的學生」需觸發資料銷毀流程：

```sql
SELECT COUNT(*) FROM students
WHERE join_date < NOW() - INTERVAL '7 years';
-- 假設加上 2 年補習班期 + 5 年保存
```

如果 > 0，啟動個資銷毀流程。

---

## 4. 👥 人員面季度 Checklist

### 4.1 帳號與權限稽核（10 分鐘）

跑下面 SQL：

```sql
-- 90 天無登入的帳號（候選 disable）
SELECT u.email, u.role, u.created_at,
  (SELECT MAX(created_at) FROM auth.sessions s WHERE s.user_id = u.id) AS last_session
FROM auth.users u
WHERE (SELECT MAX(created_at) FROM auth.sessions s WHERE s.user_id = u.id) < NOW() - INTERVAL '90 days'
   OR (SELECT MAX(created_at) FROM auth.sessions s WHERE s.user_id = u.id) IS NULL;
```

- [ ] 對每個候選帳號逐一判斷：
  - 真的離職 → 撤銷帳號 + 紀錄到 incidents/staff-offboarding/
  - 仍在職但久沒用 → 詢問是否仍需要
  - 系統帳號 / service account → 加註保留原因

### 4.2 2FA 啟用率（5 分鐘）

- [ ] Telly 自己（Supabase Dashboard）有 2FA？
- [ ] Telly 自己（Vercel）有 2FA？
- [ ] Telly 自己（GitHub）有 2FA？
- [ ] 任何有 admin 權限的員工有 2FA？

### 4.3 離職員工帳號（5 分鐘）

- [ ] 上一季有員工離職？
  - 帳號當日撤銷？
  - 共用 keys 已 rotation？
  - access_log 已 review 確認無異常？

### 4.4 員工 NDA / 個資訓練（5 分鐘）

- [ ] 所有現職員工都有簽 NDA？
- [ ] 上次員工個資教育訓練在 12 個月內？
  - 沒有 → 排今年內補做（30 分鐘 brown bag 即可）

---

## 5. 📊 商業/合規面季度 Checklist

### 5.1 客戶健康（如果有外部客戶，15 分鐘）

對**每位**付費客戶跑：

- [ ] 該客戶老師上月登入頻率 vs 前月（下降 > 30% → 紅燈）
- [ ] 該客戶聯絡簿填寫筆數變化（下降 > 50% → 紅燈）
- [ ] 30 天內有沒有主動跟你聯絡？沒有 → 主動 reach out
- [ ] 上次 NPS / 滿意度問卷在 6 個月內？

紅燈 → 啟動 [`launch-to-market-plan.md`](./launch-to-market-plan.md) §9.2 流程。

### 5.2 財務（10 分鐘）

- [ ] 上季 Supabase 帳單 vs 預期（差距 > 30% 要查）
- [ ] 上季 Vercel 帳單
- [ ] 上季 AI API 帳單（8 月後才有）— 對照 `ai_usage_log` 表
- [ ] 客戶月費收款狀況（5 家以上時）
- [ ] 銀行對帳

### 5.3 法律 / 合規（10 分鐘 — 每年 1 月做深度版）

- [ ] 個資同意書版本是否需更新？
- [ ] 客戶 DPA 是否到期？
- [ ] 新接的第三方服務有簽 DPA？
- [ ] 個資法 / 兒少法是否有新修法？
  - 上 [法務部主管法規查詢系統](https://law.moj.gov.tw/) 看「個人資料保護法」最新修訂日期

### 5.4 競爭情報（15 分鐘）

- [ ] OneClass、寶貝事務所、其他同業官網有沒有新功能 / 新方案？
- [ ] 任何補教 SaaS 新進入者？
- [ ] 你聽到的同業圈八卦是否值得記下？

---

## 6. 標準產出格式

每次季度檢視結束後，寫一份 `docs/quarterly-reviews/YYYY-QN.md`（例：`2026-Q3.md`）：

```markdown
# Quarterly Review YYYY-QN

執行日期：YYYY-MM-DD
執行者：Telly（+ 如有其他人）
總耗時：X 小時 Y 分鐘

## 技術面結果

[逐項列出，每項標 ✅ 通過 / ⚠️ 注意 / 🚨 需處理]

## 人員面結果

[同上]

## 商業/合規面結果

[同上]

## 本季需處理的 action items

| # | 項目 | 嚴重度 | 預計處理時間 | 負責人 |
|---|------|-------|------------|--------|
| 1 | ... | 🚨 高 | 1 週內 | Telly |
| 2 | ... | ⚠️ 中 | 1 月內 | Telly |

## 與上季比較

[列出明顯改善 / 退化的指標]

## 下季的特別注意事項

[基於這季發現預測下季要做什麼]

## 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| YYYY-MM-DD | 本季檢視完成 | Telly |
```

---

## 7. 執行 protocol（怎麼跑一次完整檢視）

### Step 1：開新文件

複製本範本，建 `docs/quarterly-reviews/YYYY-QN.md`。

### Step 2：照順序跑 §3 → §4 → §5

每項 checkbox 都要表態（不要跳過）。沒問題打 ✅，有疑慮打 ⚠️，必須處理打 🚨。

### Step 3：把 🚨 與 ⚠️ 項目列入 action items 表

每個都要：
- 嚴重度
- 預計處理時間
- 負責人（如果只有你自己，標 Telly）

### Step 4：跟上季結果比較

打開 `docs/quarterly-reviews/{上一季}.md`，看哪些指標進步、哪些退化。

### Step 5：寫「下季特別注意」段

預測下一季 3 個月會發生的事，列出要特別小心 / 提前準備的項目。

### Step 6：產生「commit」紀錄

把這份 review 用 git commit 進 repo。Commit message：

```
docs: quarterly review YYYY-QN
- ✅ Tech: [一句話總結]
- ✅ People: [一句話總結]
- ✅ Biz: [一句話總結]
- 🚨 action items: N 項待處理
```

---

## 8. 不同 Phase 的差異化重點

### 8.1 Phase A-D（2026-05 到 2026-08）

- 著重技術面（schema 穩定、加密無 bug、RLS 隔離正確）
- 商業面只看「自家補習班使用數據」
- 第一次大檢視建議在 2026-10（Phase D 結束 + 2 個月後）

### 8.2 AI 化階段（2026-08 開始）

- 技術面增加「AI API 成本 vs 預算」
- 增加「ai_usage_log 異常使用偵測」

### 8.3 對外賣階段（2027 起）

- 商業面成為重點（客戶健康、流失率）
- 合規面強化（DPA 完整性、隱私政策更新）
- 競爭情報變重要

### 8.4 規模化階段（10+ 客戶）

- 增加「客戶成功 KPI」
- 增加「員工 onboarding 完整性」
- 個資保險檢核

---

## 9. 失敗 case study — 如果跳過季度檢視

實際業界案例：

- **Equifax 2017 個資外洩**：1.43 億用戶資料外洩。根因：明知的安全漏洞，但**沒人定期 patch**。
- **某美國中型 SaaS**：5 個季度沒做合規檢視，被 GDPR 罰 €50M。
- **某補教業者**：員工 1 年沒清權限，離職員工挪用學生資料賣給競爭對手。

季度檢視不是「為了做」— 是**避免上述情況**。

---

## 10. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-27 | v1.0 草擬 | Claude（Telly 回國後綠燈） |

---

**文件結束**

> 一年 4 次 × 2 小時 = 8 小時。對抗「自然衰退法則」的成本，沒有比這更便宜的事了。
