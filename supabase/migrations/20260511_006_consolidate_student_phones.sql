-- ==========================================================================
-- Migration 006: Consolidate student parent phone fields
-- ==========================================================================
-- Purpose:
--   students 表現有 4 個 phone 欄位（parent_phone, parent_phone_1,
--   parent_phone_2, parent_2_phone）— 是歷史演進累積的混亂。
--   Telly 2026-05-08 授權採用「主聯絡人 + 備用」結構（比「爸爸 + 媽媽」彈性）。
--
--   合併策略：
--     primary_contact_phone   ← 第一非空值 (parent_phone OR parent_phone_1)
--     secondary_contact_phone ← 第一非空值 (parent_2_phone OR parent_phone_2)
--   合併完後 drop 4 個舊欄位。
--
-- References:
--   - docs/week0-schema-audit.md §6.3
--   - Telly 2026-05-08 授權 Q7
--
-- Changes:
--   1. ADD COLUMN primary_contact_phone, secondary_contact_phone
--   2. ADD COLUMN primary_contact_relationship, secondary_contact_relationship
--   3. Backfill from old columns
--   4. DROP COLUMN parent_phone, parent_phone_1, parent_phone_2, parent_2_phone
--   5. parent_relationship → primary_contact_relationship (rename)
--   6. parent_2_relationship → secondary_contact_relationship (rename)
--
-- Risk: 🟡 MEDIUM — 動到 152 筆學生資料的家長聯絡欄位。
--   緩解：先 ADD COLUMN + backfill，驗證後才 DROP。可 rollback。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- Step 1: Add new consolidated columns
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS primary_contact_relationship TEXT,
  ADD COLUMN IF NOT EXISTS secondary_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS secondary_contact_relationship TEXT;


-- Step 2: Backfill primary contact (取第一個非空值)
UPDATE public.students
SET primary_contact_phone = COALESCE(
  NULLIF(TRIM(parent_phone_1), ''),
  NULLIF(TRIM(parent_phone), ''),
  NULL
)
WHERE primary_contact_phone IS NULL;

UPDATE public.students
SET primary_contact_relationship = parent_relationship
WHERE primary_contact_relationship IS NULL
  AND parent_relationship IS NOT NULL;


-- Step 3: Backfill secondary contact
UPDATE public.students
SET secondary_contact_phone = COALESCE(
  NULLIF(TRIM(parent_phone_2), ''),
  NULLIF(TRIM(parent_2_phone), ''),
  NULL
)
WHERE secondary_contact_phone IS NULL;

UPDATE public.students
SET secondary_contact_relationship = parent_2_relationship
WHERE secondary_contact_relationship IS NULL
  AND parent_2_relationship IS NOT NULL;


-- Step 4: Verification — 報告 backfill 結果（不會 raise，僅用 NOTICE 記在 log）
DO $$
DECLARE
  total INTEGER;
  has_primary INTEGER;
  has_secondary INTEGER;
BEGIN
  SELECT COUNT(*) INTO total FROM public.students;
  SELECT COUNT(*) INTO has_primary FROM public.students WHERE primary_contact_phone IS NOT NULL;
  SELECT COUNT(*) INTO has_secondary FROM public.students WHERE secondary_contact_phone IS NOT NULL;

  RAISE NOTICE 'Student phone backfill: total=%, primary=%, secondary=%',
    total, has_primary, has_secondary;
END $$;


-- Step 5: Drop old columns
-- ⚠️ 注意：執行此步驟前，建議先手動 SELECT 一個學生確認 primary/secondary 欄位有正確 backfill
-- 例：SELECT id, chinese_name, parent_phone, parent_phone_1, primary_contact_phone FROM students LIMIT 5;
ALTER TABLE public.students
  DROP COLUMN IF EXISTS parent_phone,
  DROP COLUMN IF EXISTS parent_phone_1,
  DROP COLUMN IF EXISTS parent_phone_2,
  DROP COLUMN IF EXISTS parent_2_phone,
  DROP COLUMN IF EXISTS parent_relationship,
  DROP COLUMN IF EXISTS parent_2_relationship;


-- Step 6: Add comments documenting the new structure
COMMENT ON COLUMN public.students.primary_contact_phone IS
  '主要聯絡人電話（第一通知對象）。將在 008 加密。';
COMMENT ON COLUMN public.students.primary_contact_relationship IS
  '與學生的關係，例：媽媽、爸爸、阿嬤、外婆等。';
COMMENT ON COLUMN public.students.secondary_contact_phone IS
  '備用聯絡人電話。將在 008 加密。';
COMMENT ON COLUMN public.students.secondary_contact_relationship IS
  '備用聯絡人與學生的關係。';

-- 注意：students 表還有 parent_id 與 parent_id_2 兩個 FK 欄位（指向 users.id），
-- 那兩個欄位保留 — 它們不是電話，是登入帳號的關聯。


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- 若 005 跑壞需 rollback：
-- 1. 還原原 4 個欄位 + 2 個 relationship 欄位（schema 重建）
-- 2. UPDATE 把 primary_contact_phone 寫回 parent_phone_1
-- 3. DROP 新欄位
-- 完整 SQL 略，建議用 PITR 還原到本 migration 套用之前。
-- ==========================================================================
