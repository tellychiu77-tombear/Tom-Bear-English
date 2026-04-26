-- ================================================================
-- 家長學生綁定申請系統 Migration
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ================================================================

-- 新增綁定申請表
CREATE TABLE IF NOT EXISTS student_link_requests (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  parent_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  -- 家長填寫的比對資料
  submitted_chinese_name text NOT NULL,
  submitted_english_name text NOT NULL,
  submitted_phone text NOT NULL,
  -- 系統比對到的學生（可為空，代表找不到）
  matched_student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  -- 審核狀態
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE student_link_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for student_link_requests" ON student_link_requests FOR ALL USING (true) WITH CHECK (true);

-- 讓 parent_id 可為空（老師預建學生用）
ALTER TABLE students ALTER COLUMN parent_id DROP NOT NULL;

-- 確認欄位存在
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS chinese_name text;
