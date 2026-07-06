# Disaster Recovery Runbook — 一般性災難應變手冊

> **目的**：當系統發生**非個資、非加密金鑰相關**的災難（服務中斷、部署失敗、資料損毀、帳號鎖死等）時，照本手冊操作可在最短時間內止血 + 恢復。
> **撰寫日期**：2026-05-08（Telly 出差期間，Claude 撰寫）
> **適用範圍**：所有 Phase（A 開工後就生效）
> **配套文件**：
> - [`encryption-key-rotation-runbook.md`](./encryption-key-rotation-runbook.md)（加密金鑰外洩 / 輪換）
> - [`pii-protection-plan.md`](./pii-protection-plan.md) §6（個資外洩專用 SOP）

---

## 0. 災難分類總覽

當你不確定該翻哪份手冊時：

| 災難類型 | 翻這份 |
|---------|--------|
| 個資外洩、key 外洩 | `pii-protection-plan.md` + `encryption-key-rotation-runbook.md` |
| 服務中斷（404/500/timeout 大量出現）| 本手冊 §1 |
| 部署失敗 / Vercel build broken | 本手冊 §2 |
| Supabase 服務本身有狀況 | 本手冊 §3 |
| Phase A migration 跑出問題 | 本手冊 §4 |
| 資料損毀（誤刪、錯誤 UPDATE 大量資料）| 本手冊 §5 |
| 網域 / DNS 問題 | 本手冊 §6 |
| 異常流量 / DDoS | 本手冊 §7 |
| Admin 帳號鎖死、登入不了 | 本手冊 §8 |
| 不知道是什麼災難 | 本手冊 §0.2 通用 triage |

### 0.2 通用 Triage Flow（不知道發生什麼時）

```
1. 「現在發生了什麼可觀察的現象？」（不要急著診斷原因）
   - 老師打開系統說什麼？
   - 家長收到什麼錯誤？
   - 瀏覽器 console / Network panel 看到什麼？

2. 「影響範圍多大？」
   - 全平台 down？
   - 部分功能壞掉？
   - 只有某些使用者受影響？

3. 「先止血、後解決」
   - 能 rollback 部署的：先 rollback（Vercel 一鍵）
   - 能停用該功能的：暫停（feature flag）
   - 能切到舊版的：切

4. 「事件還在持續嗎？」
   - 是 → 用 §1 廣泛中斷 SOP
   - 不是 → 進入專屬 SOP

5. 「需通知使用者嗎？」
   - 影響大、超過 30 分鐘 → 系統公告 + LINE 通知
   - 影響小、5 分鐘內可解決 → 等解完後再通知
```

---

## 1. 服務廣泛中斷（最緊急）

### 1.1 症狀

- 多名使用者同時回報「打不開」「轉圈圈」「白畫面」
- Vercel dashboard 顯示 errors 飆高
- Supabase dashboard 顯示異常

### 1.2 緊急 SOP（5 分鐘內止血）

#### Step 1：判斷是 Vercel 還是 Supabase 還是 code bug

- 打開 **Vercel dashboard** → 看 deployment status：
  - 紅色 → 部署失敗，跳 §2
  - 綠色但 4xx/5xx 高 → code bug 或 Supabase 問題
- 打開 **Supabase dashboard** → 看 Project Status：
  - 任何紅燈 / Yellow → Supabase 服務本身問題，跳 §3
  - 全綠 → 不是 Supabase，是 code

#### Step 2：Code bug 處理（Vercel）

```
Vercel Dashboard → Deployments → 找到上一個正常的 deployment
→ 點 "Promote to Production" → 立刻 rollback
```

⚡ Rollback 完成約 1-2 分鐘。期間繼續顯示舊版錯誤，但**不會繼續惡化**。

#### Step 3：通知使用者

如果超過 5 分鐘 → 在 LINE 群組 / 系統公告（如果系統還能進）發：

> 系統目前正在處理技術問題，預計 X 分鐘內恢復。造成不便敬請見諒。

⚠️ 不要說「資料外洩」「資料損失」等用詞 — 沒確認就不要造成 panic。

#### Step 4：事後檢討

服務恢復後 24 小時內寫 `docs/incidents/YYYY-MM-DD-outage.md`：

```markdown
## Incident YYYY-MM-DD: 服務中斷

- 發現時間：HH:MM
- 恢復時間：HH:MM
- 持續時長：N 分鐘
- 影響範圍：[多少老師 / 家長 / 哪些功能]
- 根因：[Vercel rollback / Supabase outage / code bug XYZ]
- 應變動作：[做了什麼]
- 預防措施：[下次如何避免]
- 學到的事：[流程改進]
```

---

## 2. Vercel 部署失敗

### 2.1 症狀

- Vercel dashboard 顯示 build error
- 新版功能沒上線
- 舊版仍正常運作（Vercel 預設不切換失敗的部署）

### 2.2 SOP（中急 — 影響「新功能上線」，但既有服務 OK）

#### Step 1：看 build log

Vercel → Deployments → 失敗的 deployment → Build Logs

常見錯誤類型：

| 錯誤 | 解法 |
|------|------|
| TypeScript compile error | 修 TS error，重新 push |
| Missing env variable | 設 Vercel env vars |
| Out of memory（10K+ rows of data import）| 換 Vercel Build Plan or 移除 dev seed |
| Module not found | npm install + commit lockfile |

#### Step 2：暫不 force deploy

⚠️ Vercel 預設「失敗就不換」是好的 — 既有服務不會壞掉。**不要嘗試強制覆蓋**。

修好 code → push → Vercel 自動再跑一次 build。

#### Step 3：若 production 真的需要 rollback

```
Vercel Dashboard → Deployments → 上一個成功的 → Promote to Production
```

---

## 3. Supabase 服務本身有狀況

### 3.1 症狀

- Supabase dashboard 顯示紅燈
- https://status.supabase.com/ 看到 incident
- 全部 API 呼叫 503

### 3.2 SOP（中急 — 但 Telly 能做的事有限）

#### Step 1：確認是 Supabase 端問題

打開 https://status.supabase.com/ 確認 incident timeline。

#### Step 2：通知使用者

> 我們的後端服務商目前有服務異常，我們正在等待恢復。預計 30 分鐘內更新進度。

#### Step 3：等待

⚡ Supabase 多數 incident 30-90 分鐘內恢復。**不要在 Supabase 故障期間做任何 schema 改動或大量寫入**。

#### Step 4：恢復後驗證

- [ ] 試登入
- [ ] 試讀寫一筆資料
- [ ] 看 Supabase logs 有沒有遺留異常

#### Step 5：若 Supabase 持續中斷 24+ 小時（極罕見）

啟動「自家補習班用紙本暫代」：

- 老師恢復用紙本聯絡簿
- 接送靠手機 LINE 通知
- 待 Supabase 恢復後資料補登

⚠️ 不要急著想「換 Supabase」— 換 vendor 是大手術，平日做評估，故障當下不做決策。

---

## 4. Phase A Migration 跑壞

### 4.1 症狀

- Migration 套用過程中 SQL Editor 跑出 ERROR
- 或者套用後 application 行為異常（看不到資料、報錯）

### 4.2 SOP（高急 — 因為動到 production schema）

#### Step 1：先停止繼續套用

- 不要嘗試「修一下再跑」
- 確認哪一支 migration 失敗，記下錯誤訊息

#### Step 2：判斷影響範圍

```sql
-- 看資料還在不在
SELECT count(*) FROM public.students;     -- 應該還是 152
SELECT count(*) FROM public.exam_results; -- 應該還是 924
SELECT count(*) FROM public.users;        -- 應該還是 23
```

- 全部 row count 正常 → schema 改動沒有破壞資料，僅是 schema 不完整。可手動修補。
- Row count 異常 → 立刻 PITR 還原

#### Step 3：PITR 還原（保險路線）

```
Supabase Dashboard → Database → Point in Time Recovery
→ 選 Migration 套用前 5 分鐘的時間點
→ Confirm restore
```

⏱️ 還原約 5-15 分鐘。期間應用無法寫入。

#### Step 4：應用恢復後

- 在 preview branch 修這支 migration 的 SQL
- 在 preview branch 驗證 OK
- 重新嘗試上 production（仍走完整 pre-flight）

#### Step 5：事後檢討

把 migration 加註：「2026-XX-XX 在 production 跑失敗，原因 X，修法 Y」

⚠️ migration 失敗多數因為「沒在 preview branch 跑過」。**重要原則**：絕不直接對 production 跑沒在 preview 驗證過的 migration。

---

## 5. 資料損毀（誤刪 / 錯誤 UPDATE）

### 5.1 症狀

- 主管打電話：「我剛剛點刪除了一個學生，現在發現點錯了」
- 跑了一支 UPDATE，沒寫 WHERE，把所有 row 都改掉了
- DELETE 跑出比預期多很多 row

### 5.2 SOP（高急）

#### Step 1：立刻停止任何進一步寫入

- 暫停 cron jobs（如果有）
- 通知所有使用者「暫停操作 10 分鐘」
- 寫入越多，PITR 時要還原越多東西

#### Step 2：估計誤刪/誤改的時間點

- 「我幾點按下去的？」精確到分鐘
- 記下：誤操作發生在 X 時 Y 分 Z 秒

#### Step 3：判斷補救方案

| 情境 | 方案 |
|------|------|
| 誤刪 1 筆學生 | 從 CSV backup 找出來、用 admin 介面重新建 |
| 誤刪 < 10 筆 | 同上，手動重建 |
| 誤刪 > 10 筆 OR 錯誤 UPDATE 大量資料 | PITR 還原（會回到誤操作前，但其他正常操作也會被回退）|

#### Step 4：PITR 還原（如需要）

```
Supabase Dashboard → Database → PITR → 選誤操作前 1 分鐘的時間點
```

⚠️ 還原會**整個 DB 回到那個時間點**。其他人在誤操作後到還原前的所有寫入會丟失。所以：
1. 還原前先 export 期間的所有正常寫入（從 audit_logs / access_log 找）
2. 還原後補登
3. 通知使用者「X 點到 Y 點之間的操作可能需要重做」

#### Step 5：預防再發生

- 加 confirm dialog（刪除前要打學生姓名確認）
- 在 RLS 加 trigger 攔截「沒 WHERE 的大量 DELETE」
- 用 soft delete（加 `deleted_at` 欄位）取代真刪

---

## 6. 網域 / DNS 問題

### 6.1 症狀

- `tom-bear-english.vercel.app` 打不開（但 vercel.app 本身正常）
- 自有網域（未來）出問題

### 6.2 SOP（中急 — 影響使用者體驗但資料無損）

#### Step 1：確認是 DNS 還是 Vercel

```bash
# 從你電腦跑
dig tom-bear-english.vercel.app
nslookup tom-bear-english.vercel.app
```

如果 DNS 沒回應 → DNS 問題；有回應但 page 不開 → Vercel 問題。

#### Step 2：DNS 問題

- 自有網域：登入網域註冊商 → 看 DNS 紀錄是否正確
- 等 DNS propagation（最久 48 小時）

#### Step 3：Vercel 端問題

- Vercel Dashboard → Settings → Domains → 確認 domain 仍 active
- 重新驗證 domain

---

## 7. 異常流量 / DDoS

### 7.1 症狀

- Vercel dashboard 顯示流量飆 10 倍
- Supabase Egress 警報
- 系統慢但沒崩

### 7.2 SOP

⚠️ 補教 SaaS 規模很少會被真正 DDoS，多數「流量爆增」其實是：

- bug 導致無限重試（client side retry storm）
- bot crawler
- 某老師家長同時很多人登入（家長會、考前）

#### Step 1：看 Vercel logs 確認流量來源

- 同一個 IP 大量 request → 真的 DDoS，啟動 Vercel Pro 的 Attack Challenge Mode
- 大量同地區（台灣）真實使用者 → 正常高峰，等過去

#### Step 2：開 Vercel Attack Mode（極端時）

```
Vercel Dashboard → Project → Settings → Security → Attack Mode → Enable
```

會擋 bot，但真實使用者也會看到 Cloudflare 驗證頁面 — 接受體驗下降換來服務存活。

---

## 8. Admin 帳號鎖死

### 8.1 症狀

- Telly 自己忘記密碼 / 2FA 裝置壞掉
- 唯一的 platform_admin 無法登入

### 8.2 SOP

#### Step 1：用 Supabase 的「Magic Link」忘記密碼

Supabase Auth 預設支援 password reset email。從 `/login` 點忘記密碼。

#### Step 2：若連 email 都進不去

⚠️ 這就是為什麼**強烈建議 Telly 開 2FA 但備份 recovery codes**。

- 用 Supabase Dashboard 直接重設密碼：
  ```
  Supabase Dashboard → Authentication → Users → 找你自己 → "Reset password"
  ```
- 用 Supabase Dashboard 本身的 password（不是業務帳號）登入

#### Step 3：若連 Supabase Dashboard 都進不去

- Supabase 帳號 recovery 走 Supabase Support
- 預計 1-3 個工作天

⚠️ **預防勝於治療**：
- 1Password 存 password
- 2FA recovery codes 列印 + 鎖保險箱
- 信任的家人有「緊急聯絡指引」（萬一你出事還能 access）

---

## 9. 監控與早期偵測

### 9.1 該設定的監控（Phase A 後）

| 監控項 | 工具 | 觸發條件 |
|--------|------|---------|
| Vercel deployment failure | Vercel email | 部署失敗 |
| Supabase status | https://status.supabase.com 訂閱 | 任何 incident |
| Error rate spike | Sentry Free | error rate > baseline × 5 |
| Uptime | UptimeRobot Free | 5 分鐘 ping 一次 |
| Database storage usage | Supabase Dashboard | 月查一次 |
| Backup 完整性 | Supabase Daily Backup 確認 | 月查一次 |

### 9.2 設定建議

UptimeRobot 設定（5 分鐘設好）：
- Monitor type: HTTP(s)
- URL: https://tom-bear-english.vercel.app/api/health
- Interval: 5 分鐘
- Email alert: Telly

⚠️ `/api/health` 是 endpoint，目前沒有 — Phase A 階段建一個簡單 endpoint：

```typescript
// app/api/health/route.ts
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

export async function GET() {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from('tenants').select('id').limit(1);
    if (error) throw error;
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    return Response.json(
      { status: 'down', error: 'database unreachable' },
      { status: 503 }
    );
  }
}
```

---

## 10. Backup 完整性驗證（每月 1 次）

Supabase Pro 有 daily backup，但「有 backup」≠「backup 真的能用」。每月：

#### Step 1：確認 backup 有產生

Supabase Dashboard → Database → Backups → 看最近 7 天每天都有

#### Step 2：選一個 backup 做 dry-run restore（半年 1 次）

⚠️ 不要 restore 到 production！用 preview branch。

```
建一個 preview branch → restore 某天的 backup 到 preview → 跑 SELECT count(*) 確認資料 row count 正確
```

#### Step 3：紀錄

`docs/incidents/backup-verification-YYYY-MM.md`：

```markdown
## Backup Verification YYYY-MM
- 驗證日期：YYYY-MM-DD
- 驗證的 backup：YYYY-MM-DD's daily backup
- restored to: preview-backup-test branch
- 結果：students table count = 152 ✅, exam_results = 924 ✅
- 狀態：通過 / 失敗
```

---

## 11. 災難應變紀律清單

當任何災難發生時，**不該做**的事：

- ❌ 在 Slack/LINE 大喊「壞了壞了」造成 panic — 先評估再溝通
- ❌ 急著「直接修 production」— 在 preview branch 修
- ❌ 「我先重啟看看」— 重啟對 Supabase 沒幫助，可能讓事更糟
- ❌ 急著向使用者承諾「下個小時內修好」— 沒把握不要承諾
- ❌ 在沒備份的情況下執行 DROP / DELETE — 用 PITR 比較安全

該做的事：

- ✅ 先**觀察與診斷**，再行動
- ✅ 第一個動作是**止血**（rollback、暫停），不是「解決問題」
- ✅ **記錄所有動作**（事後檢討用）
- ✅ **承擔不確定性**：「我們正在處理，X 分鐘內更新進度」比「Y 分鐘內恢復」誠實
- ✅ 事後寫 incident report，提升下次表現

---

## 12. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |

---

**文件結束**

> 災難應變最重要的不是「事故時做什麼」，是「平時就有備案、有 backup、有監控」。本手冊每章都暗示了「平時的功課」— 平時做好 80%，事故當下做剩 20%。
