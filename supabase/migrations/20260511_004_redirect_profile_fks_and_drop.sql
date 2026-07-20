-- ==========================================================================
-- Migration 004: Redirect FKs from profiles → users, then drop profiles
-- ==========================================================================
-- Purpose:
--   解決 schema audit 第 3 節「profiles vs users 雙軌混亂」。
--   選項 A：保留 users（23 rows，真實員工資料）、drop profiles（0 rows）。
--   但要先把指向 profiles 的兩個 FK 改成指向 users。
--
-- References:
--   - docs/week0-schema-audit.md §3.3 選項 A
--   - Telly 2026-05-08 授權 Q5 採用此方案
--
-- Changes:
--   1. ALTER TABLE contact_books — change teacher_id FK from profiles → users
--   2. (chat_messages 已經 FK 到 users，messages 已在 003 被 drop)
--   3. DROP TABLE profiles
--
-- Risk: 🟡 MEDIUM — FK 改向若有資料會失敗。但 profiles 是 0 rows 且
--   contact_books 也是 0 rows，所以實質上不會有遺孤 FK。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- Step 1: 找出指向 profiles 的所有 FK 並 drop
-- （schema audit 顯示有 2 個：contact_books.teacher_id, messages.sender_id；
--   messages 已在 003 被 drop，所以只剩 contact_books.teacher_id）

-- Drop the existing FK constraint pointing to profiles
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  -- 找出 contact_books 表上指向 profiles 的 FK constraint 名稱
  -- 2026-07-06 修正：constraint_name 需加 tc. 前綴，否則 join 後兩表同名欄位歧義（staging 演練發現）
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'contact_books'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'profiles'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.contact_books DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK % from contact_books', fk_name;
  ELSE
    RAISE NOTICE 'No FK from contact_books to profiles found (may already be removed)';
  END IF;
END $$;


-- Step 2: 加新 FK 指向 users.id
-- 注意：contact_books 在 005 會被重建，所以這個 FK 可能會在 005 再重設一次。
-- 但這支 migration 還是要做，因為要讓 drop profiles 不會失敗。
ALTER TABLE public.contact_books
  ADD CONSTRAINT contact_books_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;


-- Step 3: 驗證 profiles 沒有任何 FK 指向它了
DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'profiles';

  IF fk_count > 0 THEN
    RAISE EXCEPTION 'Cannot drop profiles: % FK(s) still reference it', fk_count;
  END IF;

  RAISE NOTICE 'profiles has no remaining FK references — safe to drop';
END $$;


-- Step 4: Drop profiles 表（已確認 0 rows、無 FK 指向）
DROP TABLE IF EXISTS public.profiles CASCADE;


-- Step 5: Verification
-- 套用後跑：
--   SELECT to_regclass('public.profiles');  -- 應該回傳 NULL（表已不存在）
--   SELECT count(*) FROM public.users;       -- 應該 = 23（資料完好）


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- ⚠️ 重建 profiles 表需要 schema audit 紀錄的 14 個欄位完整定義
-- 因為 profiles 是 0 rows，rollback 沒有資料復原問題，但表結構要手動重建
-- 建議用 PITR 還原到 migration 004 套用之前
-- ==========================================================================
