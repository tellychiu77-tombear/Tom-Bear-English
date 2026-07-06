-- ==========================================================================
-- Migration 007: Add tenant_id to all business tables + backfill + NOT NULL
-- ==========================================================================
-- Purpose:
--   核心 multi-tenant migration — 把所有業務表加上 tenant_id 欄位 +
--   backfill 為 Tom Bear tenant + 設 NOT NULL + 加 FK + 建 index。
--   完成後 RLS（migration 010）才能 enforce tenant 隔離。
--
-- References:
--   - v3.0 §10.4 工作項目 2
--   - docs/week0-tech-decisions.md 決議 1 path-based + 決議 4 雙資料池
--
-- Affected tables (本支結束前需處理的)：
--   announcement_reads, announcements, attendance_records, audit_logs,
--   chat_messages, contact_books, course_sessions, exam_results,
--   leave_requests, payment_records, pickup_requests, role_configs,
--   schedule_slots, student_link_requests, student_progress_notes,
--   students, teacher_assignments, users
--   (operational_events / ai_usage_log / access_log / consent_records / tenants
--    在 001/002 已內建 tenant_id 或本身是 tenants 主表)
--
-- Strategy per table:
--   1. ADD COLUMN tenant_id UUID (nullable initially)
--   2. UPDATE table SET tenant_id = <tom_bear_uuid>
--   3. ALTER COLUMN SET NOT NULL
--   4. ADD CONSTRAINT FK to tenants(id)
--   5. CREATE INDEX
--
-- Risk: 🟡 MEDIUM — 動到所有業務表的 schema。
--   緩解：每表分步驟，先 nullable backfill 再 NOT NULL。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- Step 0: Lookup Tom Bear tenant_id (used in all backfill UPDATEs below)
DO $$
DECLARE
  tom_bear_uuid UUID;
BEGIN
  SELECT id INTO tom_bear_uuid FROM public.tenants WHERE short_code = 'tombear';
  IF tom_bear_uuid IS NULL THEN
    RAISE EXCEPTION 'Tom Bear tenant not found. Run migration 001 first.';
  END IF;
  RAISE NOTICE 'Tom Bear tenant_id = %', tom_bear_uuid;
END $$;


-- ==========================================================================
-- Helper: 為每張表加 tenant_id 的 generic 步驟（用 DO block 動態跑）
-- ==========================================================================
-- 為了避免大量重複 SQL，下面用 DO block 處理一組表。
-- 18 張業務表，每張都要 ADD + UPDATE + NOT NULL + FK + INDEX。

DO $$
DECLARE
  tom_bear_uuid UUID;
  target_tables TEXT[] := ARRAY[
    'announcement_reads', 'announcements', 'attendance_records',
    'audit_logs', 'chat_messages', 'contact_books', 'course_sessions',
    'exam_results', 'leave_requests', 'payment_records', 'pickup_requests',
    'role_configs', 'schedule_slots', 'student_link_requests',
    'student_progress_notes', 'students', 'teacher_assignments', 'users'
  ];
  tbl TEXT;
BEGIN
  SELECT id INTO tom_bear_uuid FROM public.tenants WHERE short_code = 'tombear';

  FOREACH tbl IN ARRAY target_tables LOOP
    -- Skip tables that don't exist (defensive — some may have been dropped in 003)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
      CONTINUE;
    END IF;

    -- 1. ADD COLUMN tenant_id (nullable)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID',
      tbl
    );

    -- 2. Backfill with Tom Bear tenant_id
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL',
      tbl, tom_bear_uuid
    );

    -- 3. SET NOT NULL
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL',
      tbl
    );

    -- 4. ADD FK (drop if exists for idempotency)
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      tbl, tbl || '_tenant_id_fkey'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT',
      tbl, tbl || '_tenant_id_fkey'
    );

    -- 5. CREATE INDEX
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
      'idx_' || tbl || '_tenant_id', tbl
    );

    RAISE NOTICE 'Added tenant_id to %', tbl;
  END LOOP;
END $$;


-- ==========================================================================
-- Special handling: users table 也要 role enum (platform_admin 特權)
-- ==========================================================================
-- users 表既有 role 欄位（text）。為了 RLS policy 識別 platform_admin，
-- 需確認 role 欄位的值。Telly 自己的 role 要改為 'platform_admin'。

-- 注意：這部分需要 Telly review — 因為涉及他自己的帳號權限。
-- 我先註解，套用前要先確認 Telly 的 user_id：
--
-- UPDATE public.users SET role = 'platform_admin' WHERE id = '<telly_user_id>';
--
-- 套用前必跑：SELECT id, email, role FROM users WHERE email = 'tellychiu77@gmail.com';
-- 然後手動 UPDATE 把那個 id 改成 platform_admin。

-- Add a CHECK constraint to document allowed roles (Telly 的 role 改完才加 — 此 migration 留作 TODO)
-- TODO: 在 Telly review 後加 CHECK (role IN ('platform_admin', 'tenant_owner', 'director',
--   'english_director', 'care_director', 'admin', 'admin_staff', 'teacher', 'manager', 'parent'))


-- ==========================================================================
-- Verification
-- ==========================================================================
-- 套用後跑：
--   SELECT table_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND column_name = 'tenant_id'
--   ORDER BY table_name;
-- 應該看到 18 張業務表 + 4 張 ops 表 + tenants 本身 = 23 張表都有 tenant_id


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- DO $$
-- DECLARE
--   target_tables TEXT[] := ARRAY['announcement_reads', 'announcements', ...]; -- 同上
--   tbl TEXT;
-- BEGIN
--   FOREACH tbl IN ARRAY target_tables LOOP
--     EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id CASCADE', tbl);
--   END LOOP;
-- END $$;
-- 但建議用 PITR 還原。
-- ==========================================================================
