-- ==========================================================================
-- Migration 014: Legacy 欄位清理（⚠️ 程式碼切換完成後才可套用）
-- ==========================================================================
-- Prerequisite（缺一不可）：
--   1. 前端已全面改用 students.primary_contact_phone / secondary_contact_phone
--      （2026-07-02 時 onboarding／my-child／students 頁仍在用 parent_phone 系列 — 尚未切換）
--   2. 前端聊天已全面改用 chat_messages.message（2026-07-02 已完成 ✅）
--   3. 012 已套用且驗收通過
--
-- 套用前檢查：在程式碼庫全域搜尋 parent_phone / parent_2_phone / \.content，
-- 確認 0 個殘留引用後才執行本檔。
-- ==========================================================================

-- Step 1: 重新 backfill（006 之後若有新寫入舊欄位，補到新欄位）
UPDATE public.students
SET primary_contact_phone = COALESCE(
  NULLIF(TRIM(parent_phone_1), ''),
  NULLIF(TRIM(parent_phone), ''),
  primary_contact_phone
)
WHERE COALESCE(NULLIF(TRIM(parent_phone_1), ''), NULLIF(TRIM(parent_phone), '')) IS NOT NULL;

UPDATE public.students
SET secondary_contact_phone = COALESCE(
  NULLIF(TRIM(parent_phone_2), ''),
  NULLIF(TRIM(parent_2_phone), ''),
  secondary_contact_phone
)
WHERE COALESCE(NULLIF(TRIM(parent_phone_2), ''), NULLIF(TRIM(parent_2_phone), '')) IS NOT NULL;

-- Step 2: Drop 舊 phone 欄位（原 006 Step 5）
ALTER TABLE public.students
  DROP COLUMN IF EXISTS parent_phone,
  DROP COLUMN IF EXISTS parent_phone_1,
  DROP COLUMN IF EXISTS parent_phone_2,
  DROP COLUMN IF EXISTS parent_2_phone,
  DROP COLUMN IF EXISTS parent_relationship,
  DROP COLUMN IF EXISTS parent_2_relationship;

-- Step 3: Drop chat_messages.content（012 已把資料合併進 message）
ALTER TABLE public.chat_messages
  DROP COLUMN IF EXISTS content;

-- ==========================================================================
-- ROLLBACK：欄位 drop 不可逆，套用前務必先 CSV 備份 students 與 chat_messages。
-- ==========================================================================
