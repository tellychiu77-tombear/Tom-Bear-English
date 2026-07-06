-- ==========================================================================
-- Migration 005: Fix contact_books schema (student_id type + columns)
-- ==========================================================================
-- Purpose:
--   schema audit 發現 contact_books.student_id 是 bigint，但 students.id 是 uuid
--   — 永遠連不到，這就是為什麼 0 rows（程式碼可能曾經嘗試寫入但失敗）。
--   此 migration 直接 drop & recreate 這張表（0 rows 不會丟資料）。
--
--   重建時順便整理欄位：原 21 欄裡有重複/混亂的命名（appetite/mood/focus/
--   participation/expression + photo_url + photos + comment + content + message
--   + public_note + signature_time + parent_signature 等），整理成清晰版本。
--
-- References:
--   - docs/week0-schema-audit.md §4 (型態錯誤)
--   - v3.0 §4.1 AI 觀察紀錄助手（聯絡簿是模組 A 對應的表）
--   - 設計原則第 8 條（每個 UI 都是觀察儀器 → 結構化評分欄位）
--
-- Changes:
--   1. DROP TABLE contact_books（0 rows，無資料損失）
--   2. CREATE TABLE contact_books (with correct uuid student_id + FK + cleaner schema)
--
-- Risk: 🟡 MEDIUM — drop & recreate。已驗證 0 rows，但要再確認套用當下還是 0。
--   套用前必跑：SELECT count(*) FROM contact_books; -- 必須 = 0
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- Step 1: Safety check — 確認 contact_books 仍是 0 rows
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM public.contact_books;
  IF row_count > 0 THEN
    RAISE EXCEPTION 'contact_books has % rows — refusing to drop. Manual review required.', row_count;
  END IF;
  RAISE NOTICE 'contact_books confirmed 0 rows, safe to drop & recreate';
END $$;


-- Step 2: Drop existing broken contact_books
DROP TABLE IF EXISTS public.contact_books CASCADE;


-- Step 3: Recreate with correct schema
CREATE TABLE public.contact_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 關聯（含正確的 uuid 型態 + FK）
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- 日期（一個學生一天一筆，UNIQUE 防重複）
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 結構化評分（設計原則第 8 條 — 都是觀察儀器訊號）
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),               -- 心情
  focus INTEGER CHECK (focus BETWEEN 1 AND 5),             -- 專注度
  participation INTEGER CHECK (participation BETWEEN 1 AND 5),  -- 參與度
  expression INTEGER CHECK (expression BETWEEN 1 AND 5),   -- 英文表達力
  appetite INTEGER CHECK (appetite BETWEEN 1 AND 5),       -- 食慾（幼兒園相關）

  -- 教學內容
  lesson_topic TEXT,           -- 今日課程主題（之後可結構化為 topic taxonomy）
  homework TEXT,               -- 今日作業
  homework_completed BOOLEAN,  -- 上次作業完成狀況

  -- 老師備註
  internal_note TEXT,          -- 老師內部備註（不給家長看）
  public_note TEXT,            -- 給家長看的留言

  -- 媒體
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],  -- 多張照片 URL

  -- 出缺席標記
  is_absent BOOLEAN DEFAULT FALSE,

  -- 家長確認
  parent_signed_at TIMESTAMPTZ,  -- 家長簽署時間（NULL = 未簽）

  -- AI 化階段（2026-08+）才會用到的欄位 — 預埋
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_generation_metadata JSONB,  -- 若由 AI 生成，記錄 model、tokens、cost
  ai_teacher_edits TEXT[],       -- 老師對 AI 草稿的修改

  -- 時間戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 一個學生一天最多一筆
  UNIQUE (student_id, record_date)
);

COMMENT ON TABLE public.contact_books IS
  '數位聯絡簿。每位學生每天一筆。AI 化階段（2026-08+）模組 A 會用到此表。';
COMMENT ON COLUMN public.contact_books.mood IS '心情評分 1-5 (1=很差, 5=很好)';
COMMENT ON COLUMN public.contact_books.focus IS '專注度評分 1-5';
COMMENT ON COLUMN public.contact_books.participation IS '參與度評分 1-5';
COMMENT ON COLUMN public.contact_books.expression IS '英文表達力評分 1-5';
COMMENT ON COLUMN public.contact_books.appetite IS '食慾評分 1-5 (幼兒園相關)';
COMMENT ON COLUMN public.contact_books.ai_generated IS 'TRUE = 此筆由 AI 草稿生成（老師審核過）';


-- Step 4: Indexes for common queries
CREATE INDEX idx_contact_books_student_date
  ON public.contact_books(student_id, record_date DESC);
CREATE INDEX idx_contact_books_teacher_date
  ON public.contact_books(teacher_id, record_date DESC);
CREATE INDEX idx_contact_books_date
  ON public.contact_books(record_date DESC);


-- Step 5: Auto-update updated_at
CREATE OR REPLACE FUNCTION public.contact_books_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_books_updated_at
  BEFORE UPDATE ON public.contact_books
  FOR EACH ROW
  EXECUTE FUNCTION public.contact_books_set_updated_at();


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- DROP TRIGGER IF EXISTS trg_contact_books_updated_at ON public.contact_books;
-- DROP FUNCTION IF EXISTS public.contact_books_set_updated_at();
-- DROP TABLE IF EXISTS public.contact_books CASCADE;
-- ⚠️ 但這樣 rollback 後 contact_books 完全不存在。原 21 欄結構若需要還原，
--    請用 PITR 還原到此 migration 套用之前。
-- ==========================================================================
