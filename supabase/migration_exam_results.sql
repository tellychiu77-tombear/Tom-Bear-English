-- ================================================================
-- Migration: 升級 exam_results 表 + 插入測試資料
-- 目的: 讓戰情室的考試成績模組正常運作
-- 執行方式: Supabase Dashboard → SQL Editor → 貼上執行
-- ================================================================

-- Step 1: 為 exam_results 添加缺少的欄位
ALTER TABLE exam_results
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS exam_date date;

-- Step 2: 確保 leave_requests 有 parent_id 欄位（戰情室缺席統計用）
-- (leave_requests 已有 student_id，透過 join 取 parent_id，不需額外欄位)

-- Step 3: 插入測試考試成績資料（用學生姓名查 UUID）
-- 插入 30 筆跨班級、跨科目、跨日期的測試資料
INSERT INTO exam_results (student_id, student_name, exam_name, subject, score, exam_date)
SELECT s.id, s.chinese_name, '月考 1', '英文閱讀', 85 + floor(random()*15)::int, '2026-03-15'
FROM students s WHERE s.grade LIKE 'CEI-A%' LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO exam_results (student_id, student_name, exam_name, subject, score, exam_date)
SELECT s.id, s.chinese_name, '月考 1', '英文文法', 78 + floor(random()*20)::int, '2026-03-15'
FROM students s WHERE s.grade LIKE 'CEI-B%' LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO exam_results (student_id, student_name, exam_name, subject, score, exam_date)
SELECT s.id, s.chinese_name, '月考 1', '英文聽說', 80 + floor(random()*18)::int, '2026-03-15'
FROM students s WHERE s.grade LIKE 'CEI-C%' LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO exam_results (student_id, student_name, exam_name, subject, score, exam_date)
SELECT s.id, s.chinese_name, '月考 2', '英文閱讀', 82 + floor(random()*16)::int, '2026-04-12'
FROM students s WHERE s.grade LIKE 'CEI-A%' LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO exam_results (student_id, student_name, exam_name, subject, score, exam_date)
SELECT s.id, s.chinese_name, '月考 2', '英文文法', 75 + floor(random()*22)::int, '2026-04-12'
FROM students s WHERE s.grade LIKE 'CEI-B%' LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO exam_results (student_id, student_name, exam_name, subject, score, exam_date)
SELECT s.id, s.chinese_name, '月考 2', '英文聽說', 88 + floor(random()*12)::int, '2026-04-12'
FROM students s WHERE s.grade LIKE 'CEI-C%' LIMIT 5
ON CONFLICT DO NOTHING;

-- Step 4: 插入測試請假資料
-- 先確認有哪些學生存在，再插入請假
INSERT INTO leave_requests (student_id, type, reason, start_date, end_date, status)
SELECT s.id, '病假', '發燒感冒', '2026-04-01', '2026-04-01', 'approved'
FROM students s WHERE s.grade LIKE 'CEI-A%' LIMIT 3
ON CONFLICT DO NOTHING;

INSERT INTO leave_requests (student_id, type, reason, start_date, end_date, status)
SELECT s.id, '事假', '家庭旅遊', '2026-04-07', '2026-04-08', 'approved'
FROM students s WHERE s.grade LIKE 'CEI-B%' LIMIT 2
ON CONFLICT DO NOTHING;

INSERT INTO leave_requests (student_id, type, reason, start_date, end_date, status)
SELECT s.id, '病假', '腸胃炎', '2026-04-14', '2026-04-15', 'approved'
FROM students s WHERE s.grade LIKE 'CEI-A%' OFFSET 3 LIMIT 2
ON CONFLICT DO NOTHING;

INSERT INTO leave_requests (student_id, type, reason, start_date, end_date, status)
SELECT s.id, '事假', '出國參賽', '2026-04-21', '2026-04-23', 'approved'
FROM students s WHERE s.grade LIKE 'CEI-C%' LIMIT 3
ON CONFLICT DO NOTHING;

INSERT INTO leave_requests (student_id, type, reason, start_date, end_date, status)
SELECT s.id, '病假', '感冒發燒', '2026-04-22', '2026-04-22', 'pending'
FROM students s WHERE s.grade LIKE 'CEI-B%' OFFSET 2 LIMIT 2
ON CONFLICT DO NOTHING;

-- Step 5: 驗證資料插入成功
SELECT '✅ exam_results 欄位確認:' as check_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'exam_results'
ORDER BY ordinal_position;

SELECT '✅ 測試資料筆數:' as summary,
  (SELECT count(*) FROM exam_results WHERE student_id IS NOT NULL) as exam_rows,
  (SELECT count(*) FROM leave_requests) as leave_rows;
