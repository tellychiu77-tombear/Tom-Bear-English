# Encryption Key Rotation Runbook — 加密金鑰災難應變手冊

> **目的**：當 `app_encryption_key` 或 `app_hash_key` 疑似外洩、人員異動、定期輪換需求時，照本文件操作可在不損失資料的前提下完成 key rotation。
> **撰寫日期**：2026-05-08（Telly 出差期間，Claude 撰寫）
> **規範來源**：[`../Tom_Bear_AI化優化報告_v3.0.md`](../Tom_Bear_AI化優化報告_v3.0.md) §6、[`week0-tech-decisions.md`](./week0-tech-decisions.md) 決議 3
> **適用時機**：Phase A migration 008 + 009 套用之後（加密 + hash 機制上線後）

---

## 0. 這份手冊解決三類情境

| 情境 | 緊急程度 | SOP 章節 |
|------|---------|---------|
| 🚨 Key 外洩（commit 進 GitHub / 給錯人 / 不確定誰看過） | 立刻執行 | §2 緊急 SOP |
| ⚠️ 員工 / 合作夥伴離職（看過 key） | 1 週內執行 | §3 標準 rotation |
| ⏰ 定期輪換（建議每 12 個月一次）| 計畫性 | §3 標準 rotation |

---

## 1. 必懂的概念

### 1.1 我們有兩支 key

- **`app_encryption_key`**：對稱加密用，保護 PII 欄位（學生姓名、家長電話等）
- **`app_hash_key`**：HMAC 用，產生 `_search_hash` 副欄讓加密欄位可搜尋

**兩支 key 必須分開**。理由：
- encryption_key 漏 → 全部 PII 可解開（災難）
- hash_key 漏 → 攻擊者可用字典 attack 反推某些常見字串（次災難）
- 兩支都漏才完全失守

### 1.2 Key 存在哪裡

- **Supabase Vault**：主要儲存位置（運行時應用層從這裡取）
- **離線備份**（必要）：1Password / 加密 USB / 紙本保險箱
- **絕不**：放 `.env` 檔案、放程式碼、放 README

### 1.3 為什麼 rotation 不能瞬間完成

加密欄位是 `encrypt(plaintext, old_key)`。新 key 來了，舊資料仍是用舊 key 加密的。要 rotation 必須：

1. **解密所有舊資料**（用舊 key）
2. **重新加密**（用新 key）
3. **寫回 DB**

這個過程要時間 + 要兩支 key 同時存在。

---

## 2. 緊急 SOP — Key 外洩

> **判斷標準**：你**不確定誰看過 key**，或 key 出現在不該出現的地方（GitHub、Slack、Email、截圖等）。

### Step 0：心態 — 不要慌

PITR 還在、資料還在。慌的時候做錯事比 key 外洩本身更糟。

### Step 1：立刻判斷外洩範圍（5 分鐘）

- [ ] **encryption_key** 外洩了嗎？→ 嚴重，所有 PII 都該假設已可被解開
- [ ] **hash_key** 外洩了嗎？→ 中度，搜尋 hash 可被字典攻擊
- [ ] **兩支都** 外洩？→ 最嚴重，啟動完整 rotation + 通知

### Step 2：立刻產生新 key（5 分鐘）

```bash
# 在你本地 terminal（不要透過 Cowork、不要透過 Slack）
openssl rand -base64 32  # 新 encryption_key
openssl rand -base64 32  # 新 hash_key
```

**只在你本機看到這些值。** 不貼到任何訊息平台。

### Step 3：存進 Supabase Vault — 用 `_v2` 後綴並存（10 分鐘）

⚠️ **不要覆蓋舊 key**。新舊兩支要同時存在於 Vault，rotation 過程中切換。

在 Supabase Dashboard → Settings → Vault：

1. 新增 secret：name = `app_encryption_key_v2`、value = 新 encryption_key
2. 新增 secret：name = `app_hash_key_v2`、value = 新 hash_key

舊的 `app_encryption_key` 與 `app_hash_key` **暫時保留**，rotation 完成後才刪。

### Step 4：執行 rotation migration（30 分鐘）

⚠️ 強烈建議在 **maintenance window** 執行（補習班晚上 22:00 後）— 過程中應用層會短暫無法解密。

#### Step 4.1：應用層暫停讀寫 PII 的功能

- 公告：「系統維護中，預計 30 分鐘」
- 暫停 cron jobs（特別是讀 students 表的）
- 把 Vercel 設成 maintenance mode（or 顯示維護 banner）

#### Step 4.2：跑 rotation 函式

在 Supabase Dashboard → SQL Editor：

```sql
-- ==========================================================================
-- KEY ROTATION SQL — 套用前確認在 maintenance window
-- ==========================================================================

-- Step A：SET 兩支 key（舊的用於解密、新的用於加密）
SET app.encryption_key = '<舊 encryption_key 從 Vault 取>';
SET app.hash_key = '<舊 hash_key 從 Vault 取>';
SET app.encryption_key_new = '<新 encryption_key>';
SET app.hash_key_new = '<新 hash_key>';

-- Step B：建立暫時的 rotation function
CREATE OR REPLACE FUNCTION public.rotate_pii_keys()
RETURNS TABLE (table_name TEXT, rows_rotated INTEGER) AS $$
DECLARE
  old_key TEXT := current_setting('app.encryption_key');
  new_key TEXT := current_setting('app.encryption_key_new');
  old_hash_key TEXT := current_setting('app.hash_key');
  new_hash_key TEXT := current_setting('app.hash_key_new');
  cnt INTEGER;
BEGIN
  -- students 表
  UPDATE public.students SET
    chinese_name_encrypted = pgp_sym_encrypt(pgp_sym_decrypt(chinese_name_encrypted, old_key), new_key),
    english_name_encrypted = CASE WHEN english_name_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(english_name_encrypted, old_key), new_key) END,
    primary_contact_phone_encrypted = CASE WHEN primary_contact_phone_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(primary_contact_phone_encrypted, old_key), new_key) END,
    secondary_contact_phone_encrypted = CASE WHEN secondary_contact_phone_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(secondary_contact_phone_encrypted, old_key), new_key) END,
    birthday_encrypted = CASE WHEN birthday_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(birthday_encrypted, old_key), new_key) END,
    photo_url_encrypted = CASE WHEN photo_url_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(photo_url_encrypted, old_key), new_key) END,
    allergies_encrypted = CASE WHEN allergies_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(allergies_encrypted, old_key), new_key) END,
    special_needs_encrypted = CASE WHEN special_needs_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(special_needs_encrypted, old_key), new_key) END,
    learning_goal_encrypted = CASE WHEN learning_goal_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(learning_goal_encrypted, old_key), new_key) END,
    -- search hashes 用新 hash_key 重算
    chinese_name_search_hash = hmac(LOWER(TRIM(pgp_sym_decrypt(chinese_name_encrypted, old_key))), new_hash_key, 'sha256'),
    english_name_search_hash = CASE WHEN english_name_encrypted IS NOT NULL
      THEN hmac(LOWER(TRIM(pgp_sym_decrypt(english_name_encrypted, old_key))), new_hash_key, 'sha256') END,
    primary_contact_phone_search_hash = CASE WHEN primary_contact_phone_encrypted IS NOT NULL
      THEN hmac(LOWER(TRIM(pgp_sym_decrypt(primary_contact_phone_encrypted, old_key))), new_hash_key, 'sha256') END,
    secondary_contact_phone_search_hash = CASE WHEN secondary_contact_phone_encrypted IS NOT NULL
      THEN hmac(LOWER(TRIM(pgp_sym_decrypt(secondary_contact_phone_encrypted, old_key))), new_hash_key, 'sha256') END;
  
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT 'students'::TEXT, cnt;

  -- users 表（同樣模式）
  UPDATE public.users SET
    name_encrypted = CASE WHEN name_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(name_encrypted, old_key), new_key) END,
    email_encrypted = CASE WHEN email_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(email_encrypted, old_key), new_key) END,
    phone_encrypted = CASE WHEN phone_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(phone_encrypted, old_key), new_key) END,
    contact_info_encrypted = CASE WHEN contact_info_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(contact_info_encrypted, old_key), new_key) END,
    name_search_hash = CASE WHEN name_encrypted IS NOT NULL
      THEN hmac(LOWER(TRIM(pgp_sym_decrypt(name_encrypted, old_key))), new_hash_key, 'sha256') END,
    email_search_hash = CASE WHEN email_encrypted IS NOT NULL
      THEN hmac(LOWER(TRIM(pgp_sym_decrypt(email_encrypted, old_key))), new_hash_key, 'sha256') END,
    phone_search_hash = CASE WHEN phone_encrypted IS NOT NULL
      THEN hmac(LOWER(TRIM(pgp_sym_decrypt(phone_encrypted, old_key))), new_hash_key, 'sha256') END;

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT 'users'::TEXT, cnt;

  -- exam_results 表
  UPDATE public.exam_results SET
    student_name_encrypted = CASE WHEN student_name_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(student_name_encrypted, old_key), new_key) END;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT 'exam_results'::TEXT, cnt;

  -- audit_logs, access_log
  UPDATE public.audit_logs SET
    ip_address_encrypted = CASE WHEN ip_address_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(ip_address_encrypted, old_key), new_key) END;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT 'audit_logs'::TEXT, cnt;

  UPDATE public.access_log SET
    actor_ip_encrypted = CASE WHEN actor_ip_encrypted IS NOT NULL
      THEN pgp_sym_encrypt(pgp_sym_decrypt(actor_ip_encrypted, old_key), new_key) END;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT 'access_log'::TEXT, cnt;
END;
$$ LANGUAGE plpgsql;

-- Step C：執行 rotation（會跑幾秒到幾分鐘看資料量）
SELECT * FROM public.rotate_pii_keys();
-- 預期輸出（Tom Bear 規模）：
--   students     | 152
--   users        | 23
--   exam_results | 924
--   audit_logs   | X
--   access_log   | Y

-- Step D：清掉暫時 function
DROP FUNCTION public.rotate_pii_keys();
```

#### Step 4.3：把新 key 改名為主要 key 名稱

在 Supabase Dashboard Vault：

- `app_encryption_key`（舊）→ 改名為 `app_encryption_key_OLD_REVOKE`
- `app_encryption_key_v2`（新）→ 改名為 `app_encryption_key`
- `app_hash_key`（舊）→ 改名為 `app_hash_key_OLD_REVOKE`
- `app_hash_key_v2`（新）→ 改名為 `app_hash_key`

這樣應用層下次連線取 `app_encryption_key` 就是新的。

#### Step 4.4：驗證 round-trip 用新 key 可解

```sql
SET app.encryption_key = '<新 encryption_key>';
SET app.hash_key = '<新 hash_key>';

-- 用新 key 解一筆 student（不能洩漏到 log，看數值對不對就好）
SELECT public.decrypt_pii(chinese_name_encrypted) IS NOT NULL AS decrypt_ok
FROM public.students LIMIT 3;
-- 應全部回 true
```

如果回 false 或報錯 → rotation 失敗，**立刻啟動 PITR 還原**到 Step 4.1 之前。

#### Step 4.5：恢復應用層

- 關 maintenance mode
- 重啟 cron jobs
- 發訊息告知維護完成

### Step 5：銷毀舊 key（24 小時後）

確認新 key 連續運作 24 小時無異常後：

- Supabase Vault 中**刪除** `app_encryption_key_OLD_REVOKE` 與 `app_hash_key_OLD_REVOKE`
- 離線備份的舊 key 也要安全銷毀（USB 物理銷毀 / 紙本碎掉）

⚠️ 銷毀舊 key 之後，**舊 key 加密的資料完全無法解開**。所以必須先確認 rotation 成功 24 小時。

### Step 6：事後檢討（1 週內）

- 找出 key 是怎麼外洩的
- 修補流程漏洞（教育、自動化檢查 pre-commit hook）
- 寫成 incident report 存進 `docs/incidents/YYYY-MM-DD-key-leak.md`

---

## 3. 標準 Rotation SOP（非緊急）

跟 §2 緊急 SOP 流程相同，差別只在：

- 不用立刻做（可挑日子）
- 不用 5 分鐘判斷
- 可以提前 1 週通知使用者

執行時機建議：

- **每 12 個月**做一次定期輪換
- **員工 / 合作夥伴離職**後 1 週內
- **Supabase 安全公告**有 CVE 影響時

---

## 4. Pre-commit Hook（避免 key 被 commit）

防呆機制 — 在 `.husky/pre-commit` 或 `package.json` 加 git hook：

```bash
#!/bin/sh
# .husky/pre-commit

# 阻止 commit 含潛在 key 的內容
if git diff --cached | grep -E "(app_encryption_key|app_hash_key|sk_live_|sk_test_)" > /dev/null; then
  echo "❌ 偵測到疑似 secret key 內容，commit 被阻止"
  echo "如果是假 key（test 用），用 placeholder 取代"
  exit 1
fi

# 阻止 commit .env.local 或 private-research/
if git diff --cached --name-only | grep -E "(\.env\.local|private-research/)" > /dev/null; then
  echo "❌ 偵測到 .env.local 或 private-research/ 被加入 commit"
  exit 1
fi
```

設定方法：

```bash
cd mom-call-app
npm install husky --save-dev
npx husky init
# 把上面 hook 寫進 .husky/pre-commit
chmod +x .husky/pre-commit
```

---

## 5. Key 外洩的判斷標準

什麼算「外洩」？至少符合一項即算：

- [ ] Key 出現在 git commit（不論是否已 push）
- [ ] Key 出現在 Slack / Discord / Telegram 訊息
- [ ] Key 出現在 Email
- [ ] Key 寫在便條紙 / 白板被拍照
- [ ] Key 透過螢幕分享被錄到
- [ ] 任何曾接觸 key 的人離職 / 解雇 / 失聯
- [ ] 你或合作夥伴的電腦被入侵 / 中毒
- [ ] Cowork / Supabase / 1Password 等服務有資料外洩公告，且時間範圍涵蓋你存 key 的時間

任一條中 → 啟動 §2 緊急 SOP。

---

## 6. 通知義務

⚠️ **個資法第 12 條**：發生個資外洩**事實上知悉或有合理懷疑時**，應通知當事人（家長與學生）。

如果 encryption_key 外洩 + 攻擊者可能拿到 DB → **形同所有 PII 都該假設已外洩**，需通知家長。

通知範本（暫定）：

> 親愛的 [補習班名] 家長您好：
> 
> 我們發現本系統的資料保護金鑰於 YYYY-MM-DD 可能外洩。雖然外部攻擊者實際取得資料的可能性低（因為他們還需取得我們的資料庫存取權），但依個資法規定我們仍主動通知您：
> 
> 可能影響的資料項目：學生姓名、家長聯絡電話、過敏資料（若有）等。
> 
> 我們已採取措施：
> 1. 立刻更換金鑰，重新加密全部資料
> 2. 強化內部存取流程
> 3. 持續監控異常存取
> 
> 您有任何疑問請聯絡 [Telly 的聯絡方式]。

⚠️ 發通知前**強烈建議**先諮詢律師（即使付一次性諮詢費 NT$10,000-30,000）。

---

## 7. 變更日誌

| 日期 | 變更 | 維護人 |
|------|------|--------|
| 2026-05-08 | v1.0 草擬（Telly 出差期間） | Claude |

---

**文件結束**

> 希望永遠用不到這份手冊。但如果用到，依序執行就能止血。
