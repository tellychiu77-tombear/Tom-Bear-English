-- ================================================================
-- 學生資料 seed「假資料範本」（開發／測試環境用）
-- ================================================================
-- ⚠️ 真實學生資料（supabase/seed_students.sql）已於 2026-07-02 移出版本庫，
--    並加入 .gitignore。真實資料只存在 Telly 本機與 production DB。
--    git 歷史清理方式見 scripts/purge-pii-from-git-history.md。
--
-- 本檔為結構相同的假資料，供新環境開發測試使用。
-- ================================================================

-- Step 1: parent_id 改為可為空（老師預建學生，家長之後綁定）
ALTER TABLE students ALTER COLUMN parent_id DROP NOT NULL;

-- Step 2: 確認欄位存在
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS chinese_name text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS english_name text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_2_phone text;

-- Step 3: 假資料（結構與真實 seed 相同）
INSERT INTO students (chinese_name, english_name, grade, parent_phone, parent_2_phone) VALUES
('王小明', 'Kevin',  'CEI-A, 課後輔導', '0911111111', '0922222222'),
('陳小美', 'Amy',    'CEI-A',           '0933333333', NULL),
('林大寶', 'Leo',    'CEI-B, 課後輔導', '0944444444', '0955555555'),
('張小花', 'Lily',   'CEI-B',           '0966666666', NULL),
('黃小強', 'Max',    'CEI-C',           '0977777777', NULL),
('吳小婷', 'Tina',   '課後輔導',        '0988888888', '0900000000');

-- CLEANUP（測試後清除）：
-- DELETE FROM students WHERE parent_phone IN
--   ('0911111111','0933333333','0944444444','0966666666','0977777777','0988888888');
