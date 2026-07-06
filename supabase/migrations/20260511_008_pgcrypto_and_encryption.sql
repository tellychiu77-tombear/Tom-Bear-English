-- ==========================================================================
-- Migration 008: pgcrypto setup + encrypt PII columns
-- ==========================================================================
-- Purpose:
--   啟用 pgcrypto extension、設定加密 key、把 18 個 PII 欄位加密。
--
-- References:
--   - v3.0 §6.2 個資合規四件事 #1（資料庫加密）
--   - docs/week0-tech-decisions.md 決議 3（pgcrypto）
--   - docs/week0-schema-audit.md §6 PII 欄位清單
--
-- ⚠️ 這支 migration 是高風險的（🔴 HIGH）：
--   1. 加密欄位後，無 key 的任何查詢都會看到亂碼
--   2. 應用層的 query 必須 wrap 在 pgp_sym_decrypt() 才能讀
--   3. 套用前確認 lib/supabaseClient.ts 已準備好 decryption helper
--
-- Strategy:
--   1. CREATE EXTENSION pgcrypto
--   2. 為每張表加 _encrypted 副欄（BYTEA 型）
--   3. UPDATE 把明文欄位內容加密進副欄
--   4. 驗證解密 round-trip 正確
--   5. 此 migration **不 DROP 原明文欄位** — 留給後續驗證後手動 drop
--      （讓 Telly 可在 production 跑一週確認加解密無 bug，再 drop 原欄位）
--
-- Key management:
--   加密 key 不放在 SQL 裡。透過 PostgreSQL session variable 傳入：
--     SET app.encryption_key = '<secret>'
--   Supabase Vault 設定（管理員介面）：
--     vault.create_secret('<key>', 'app_encryption_key', 'Master key for PII encryption')
--   應用層每次連線後 SET 一次。詳見 lib/supabaseClient.ts 之後的更新。
--
-- Risk: 🔴 HIGH — 處理 PII。任何錯誤會導致：(a) 資料無法解 (b) 加密失效。
--   緩解：先在 preview branch 套用，跑 round-trip 驗證再上 production。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- Step 1: Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- Step 2: Create helper functions for encryption / decryption
--         (這層 wrapper 讓應用層呼叫更簡潔，未來換 key 也只動這裡)

CREATE OR REPLACE FUNCTION public.encrypt_pii(plaintext TEXT)
RETURNS BYTEA AS $$
DECLARE
  key TEXT;
BEGIN
  -- 從 session variable 取 key（連線時應用層 SET 過）
  key := current_setting('app.encryption_key', true);
  IF key IS NULL OR key = '' THEN
    RAISE EXCEPTION 'app.encryption_key not set in session. App layer must SET before any encrypt/decrypt.';
  END IF;
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(plaintext, key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrypt_pii(ciphertext BYTEA)
RETURNS TEXT AS $$
DECLARE
  key TEXT;
BEGIN
  key := current_setting('app.encryption_key', true);
  IF key IS NULL OR key = '' THEN
    RAISE EXCEPTION 'app.encryption_key not set in session.';
  END IF;
  IF ciphertext IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(ciphertext, key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.encrypt_pii IS
  'Encrypt PII using key from session variable app.encryption_key. App must SET this before connection use.';


-- ==========================================================================
-- Step 3: Add encrypted columns to STUDENTS table
-- ==========================================================================
-- 加密欄位：chinese_name, english_name, primary_contact_phone, secondary_contact_phone,
--           birthday, photo_url, allergies, special_needs, learning_goal

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS chinese_name_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS english_name_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS primary_contact_phone_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS secondary_contact_phone_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS birthday_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS photo_url_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS allergies_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS special_needs_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS learning_goal_encrypted BYTEA;

-- Backfill — 套用此 migration 之前，**必須在 SQL session SET app.encryption_key**
-- 例（在 Supabase SQL Editor 跑此 migration 前）：
--   SET app.encryption_key = '<from-supabase-vault>';
DO $$
DECLARE
  key_check TEXT;
BEGIN
  key_check := current_setting('app.encryption_key', true);
  IF key_check IS NULL OR key_check = '' THEN
    RAISE EXCEPTION
      'app.encryption_key not set. Before running this migration, execute: SET app.encryption_key = ''<your-secret>'';';
  END IF;
END $$;

UPDATE public.students SET
  chinese_name_encrypted = public.encrypt_pii(chinese_name),
  english_name_encrypted = public.encrypt_pii(english_name),
  primary_contact_phone_encrypted = public.encrypt_pii(primary_contact_phone),
  secondary_contact_phone_encrypted = public.encrypt_pii(secondary_contact_phone),
  birthday_encrypted = public.encrypt_pii(birthday::TEXT),
  photo_url_encrypted = public.encrypt_pii(photo_url),
  allergies_encrypted = public.encrypt_pii(allergies),
  special_needs_encrypted = public.encrypt_pii(special_needs),
  learning_goal_encrypted = public.encrypt_pii(learning_goal)
WHERE chinese_name_encrypted IS NULL;


-- ==========================================================================
-- Step 4: USERS table encryption
-- ==========================================================================
-- 加密欄位：name, email, phone, contact_info

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS email_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS phone_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS contact_info_encrypted BYTEA;

UPDATE public.users SET
  name_encrypted = public.encrypt_pii(name),
  email_encrypted = public.encrypt_pii(email),
  phone_encrypted = public.encrypt_pii(phone),
  contact_info_encrypted = public.encrypt_pii(contact_info::TEXT)
WHERE name_encrypted IS NULL;

-- 注意：users.email 用於 Supabase Auth login，**不能 drop**！
-- 加密版只用於系統內部展示。Auth 流程仍用 auth.users.email。


-- ==========================================================================
-- Step 5: EXAM_RESULTS table encryption (student_name 反正規化欄位)
-- ==========================================================================

ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS student_name_encrypted BYTEA;

UPDATE public.exam_results SET
  student_name_encrypted = public.encrypt_pii(student_name)
WHERE student_name_encrypted IS NULL AND student_name IS NOT NULL;


-- ==========================================================================
-- Step 6: AUDIT_LOGS / ACCESS_LOG IP encryption
-- ==========================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_address_encrypted BYTEA;
UPDATE public.audit_logs SET
  ip_address_encrypted = public.encrypt_pii(ip_address)
WHERE ip_address_encrypted IS NULL AND ip_address IS NOT NULL;

ALTER TABLE public.access_log
  ADD COLUMN IF NOT EXISTS actor_ip_encrypted BYTEA;
-- access_log 是新表，可能還沒資料；UPDATE 仍安全
UPDATE public.access_log SET
  actor_ip_encrypted = public.encrypt_pii(actor_ip)
WHERE actor_ip_encrypted IS NULL AND actor_ip IS NOT NULL;


-- ==========================================================================
-- Step 7: Round-trip verification
-- ==========================================================================
-- 套用後跑此檢查，確認加解密來回一致：
DO $$
DECLARE
  sample_id UUID;
  original_name TEXT;
  decrypted_name TEXT;
BEGIN
  -- 取一筆 student 做 round-trip 測試
  SELECT id, chinese_name INTO sample_id, original_name
  FROM public.students
  WHERE chinese_name IS NOT NULL
  LIMIT 1;

  IF sample_id IS NULL THEN
    RAISE NOTICE 'No student records to verify. Skipping round-trip test.';
    RETURN;
  END IF;

  SELECT public.decrypt_pii(chinese_name_encrypted) INTO decrypted_name
  FROM public.students WHERE id = sample_id;

  IF decrypted_name IS DISTINCT FROM original_name THEN
    RAISE EXCEPTION 'Round-trip FAILED for student %: original=%, decrypted=%',
      sample_id, original_name, decrypted_name;
  END IF;

  RAISE NOTICE 'Round-trip verification passed for student %', sample_id;
END $$;


-- ==========================================================================
-- ⚠️ DO NOT DROP PLAINTEXT COLUMNS IN THIS MIGRATION
-- ==========================================================================
-- 故意保留原 chinese_name, email 等明文欄位，理由：
--   1. 讓應用層分階段切換到 _encrypted 欄位
--   2. 留一週驗證期，跑 production 後再決定 drop
--   3. drop 明文欄位是不可逆的（一旦 drop，要還原必須有 key）
--
-- 下一支 migration（009 search_hash + 011 後續清理）會處理 drop。


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- ALTER TABLE public.students DROP COLUMN IF EXISTS chinese_name_encrypted, ...;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS name_encrypted, ...;
-- ...
-- DROP FUNCTION IF EXISTS public.encrypt_pii(TEXT);
-- DROP FUNCTION IF EXISTS public.decrypt_pii(BYTEA);
-- DROP EXTENSION IF EXISTS pgcrypto;  -- ⚠️ 只在沒人用 pgcrypto 時才 drop
-- ==========================================================================
