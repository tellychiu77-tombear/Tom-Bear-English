-- ==========================================================================
-- Migration 009: Add search_hash columns for encrypted PII
-- ==========================================================================
-- Purpose:
--   加密欄位無法直接 `WHERE chinese_name = '王小明'`（看到的是 BYTEA 亂碼）。
--   為了讓「精確比對搜尋」（e.g., 後台用姓名找學生）仍可運作，
--   為每個需搜尋的加密欄位加一個 HMAC-SHA256 hash 副欄。
--
--   搜尋邏輯：應用層把使用者輸入的搜尋字串先 HMAC 同樣 key，
--             再用 WHERE search_hash = <hash> 查。
--
--   ⚠️ 僅支援「精確比對」，不支援部分比對（LIKE）或排序。
--   ⚠️ Hash 是 deterministic — 同字串永遠同 hash — 安全代價：可被字典攻擊。
--      因此 hash key 須跟 encryption key 分開存放（雙 key 設計）。
--
-- References:
--   - docs/week0-schema-audit.md §6 PII 欄位清單
--   - docs/week0-tech-decisions.md 決議 3 後續處理 #1
--
-- Affected columns (只挑「實際會被搜尋」的)：
--   students.chinese_name → chinese_name_search_hash
--   students.english_name → english_name_search_hash
--   students.primary_contact_phone → primary_contact_phone_search_hash
--   students.secondary_contact_phone → secondary_contact_phone_search_hash
--   users.email → email_search_hash
--   users.phone → phone_search_hash
--   users.name → name_search_hash
--
-- Risk: 🟡 MEDIUM — 純加副欄位 + backfill，不影響既有資料。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- Step 1: Helper function for HMAC hashing
-- Hash key 從 session variable app.hash_key 取（與 encryption key 分開）
CREATE OR REPLACE FUNCTION public.hash_for_search(input_text TEXT)
RETURNS BYTEA AS $$
DECLARE
  key TEXT;
BEGIN
  key := current_setting('app.hash_key', true);
  IF key IS NULL OR key = '' THEN
    RAISE EXCEPTION 'app.hash_key not set in session.';
  END IF;
  IF input_text IS NULL OR input_text = '' THEN
    RETURN NULL;
  END IF;
  -- HMAC-SHA256 — deterministic 且 collision-resistant
  RETURN hmac(LOWER(TRIM(input_text)), key, 'sha256');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.hash_for_search IS
  'HMAC-SHA256 for searchable encrypted columns. Input is lowercased + trimmed for normalization.';


-- Step 2: Pre-check: hash key must be set
DO $$
BEGIN
  IF current_setting('app.hash_key', true) IS NULL OR current_setting('app.hash_key', true) = '' THEN
    RAISE EXCEPTION
      'app.hash_key not set. Run: SET app.hash_key = ''<your-hash-secret>''; before this migration.';
  END IF;
END $$;


-- Step 3: STUDENTS table search hashes
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS chinese_name_search_hash BYTEA,
  ADD COLUMN IF NOT EXISTS english_name_search_hash BYTEA,
  ADD COLUMN IF NOT EXISTS primary_contact_phone_search_hash BYTEA,
  ADD COLUMN IF NOT EXISTS secondary_contact_phone_search_hash BYTEA;

UPDATE public.students SET
  chinese_name_search_hash = public.hash_for_search(chinese_name),
  english_name_search_hash = public.hash_for_search(english_name),
  primary_contact_phone_search_hash = public.hash_for_search(primary_contact_phone),
  secondary_contact_phone_search_hash = public.hash_for_search(secondary_contact_phone)
WHERE chinese_name_search_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_students_chinese_name_hash
  ON public.students(tenant_id, chinese_name_search_hash);
CREATE INDEX IF NOT EXISTS idx_students_phone1_hash
  ON public.students(tenant_id, primary_contact_phone_search_hash);


-- Step 4: USERS table search hashes
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_search_hash BYTEA,
  ADD COLUMN IF NOT EXISTS phone_search_hash BYTEA,
  ADD COLUMN IF NOT EXISTS name_search_hash BYTEA;

UPDATE public.users SET
  email_search_hash = public.hash_for_search(email),
  phone_search_hash = public.hash_for_search(phone),
  name_search_hash = public.hash_for_search(name)
WHERE email_search_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_hash
  ON public.users(email_search_hash);
CREATE INDEX IF NOT EXISTS idx_users_phone_hash
  ON public.users(tenant_id, phone_search_hash);


-- Step 5: Trigger to keep hash columns in sync when encrypted column updates
-- 簡化版：未來應用層應該同時 UPDATE 兩個欄位（加密 + hash）。
-- 此處只做 backfill；新寫入由應用層負責同步。


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- DROP INDEX IF EXISTS public.idx_users_phone_hash, public.idx_users_email_hash,
--   public.idx_students_phone1_hash, public.idx_students_chinese_name_hash;
-- ALTER TABLE public.users DROP COLUMN email_search_hash, phone_search_hash, name_search_hash;
-- ALTER TABLE public.students DROP COLUMN chinese_name_search_hash, english_name_search_hash,
--   primary_contact_phone_search_hash, secondary_contact_phone_search_hash;
-- DROP FUNCTION IF EXISTS public.hash_for_search(TEXT);
-- ==========================================================================
