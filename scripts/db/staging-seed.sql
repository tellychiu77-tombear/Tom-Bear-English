-- ============================================================
-- Staging 假資料 seed（只能用在測試專案！不要跑在 production！）
-- 建立：2 個家長、1 個老師、1 個行政、1 個總園長、3 個學生
-- 用於 migration 演練（006/007/008 的 backfill 會處理到這些資料）
-- 與 012 之後的驗收測試（acceptance.mjs 依賴這些固定 UUID）
-- ============================================================

-- 測試帳號固定 UUID（acceptance.mjs 會用到）
-- parentA: 11111111-1111-1111-1111-111111111111
-- parentB: 22222222-2222-2222-2222-222222222222
-- teacher: 33333333-3333-3333-3333-333333333333
-- admin:   44444444-4444-4444-4444-444444444444
-- director:55555555-5555-5555-5555-555555555555

-- 1. auth.users（staging 專用最小欄位插入）
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated',
  v.email, '', now(), now(), now(), '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
FROM (VALUES
  ('11111111-1111-1111-1111-111111111111', 'parent-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'parent-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'teacher@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'admin@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'director@test.local')
) AS v(id, email)
ON CONFLICT (id) DO NOTHING;

-- 2. public.users
INSERT INTO public.users (id, email, name, role, is_approved)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'parent-a@test.local', '測試家長A', 'parent', true),
  ('22222222-2222-2222-2222-222222222222', 'parent-b@test.local', '測試家長B', 'parent', true),
  ('33333333-3333-3333-3333-333333333333', 'teacher@test.local', '測試老師', 'teacher', true),
  ('44444444-4444-4444-4444-444444444444', 'admin@test.local', '測試行政', 'admin', true),
  ('55555555-5555-5555-5555-555555555555', 'director@test.local', '測試園長', 'director', true)
ON CONFLICT (id) DO NOTHING;

-- 3. students（A 家兩個、B 家一個；含舊 phone 欄位供 006 backfill 演練）
INSERT INTO public.students (id, chinese_name, english_name, grade, parent_id, parent_phone, parent_2_phone)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '測試童一', 'Kid One', 'CEI-A, 課後輔導',
   '11111111-1111-1111-1111-111111111111', '0911111111', NULL),
  ('aaaaaaaa-0000-0000-0000-000000000002', '測試童二', 'Kid Two', 'CEI-A',
   '11111111-1111-1111-1111-111111111111', '0911111111', '0912222222'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '測試童三', 'Kid Three', 'CEI-B',
   '22222222-2222-2222-2222-222222222222', '0933333333', NULL)
ON CONFLICT (id) DO NOTHING;

-- 4. 業務資料各一點（讓 007 tenant backfill、012 驗收有東西可測）
INSERT INTO public.exam_results (student_id, student_name, exam_name, subject, score, exam_date)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '測試童一', '演練月考', '英文閱讀', 88, '2026-06-15'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '測試童三', '演練月考', '英文閱讀', 92, '2026-06-15')
ON CONFLICT DO NOTHING;

INSERT INTO public.leave_requests (student_id, type, reason, start_date, end_date, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '病假', '演練用假單', '2026-06-20', '2026-06-20', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_messages (sender_id, receiver_id, message, is_read)
VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '演練訊息 A→師', false)
ON CONFLICT DO NOTHING;
