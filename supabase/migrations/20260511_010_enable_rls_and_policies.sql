-- ==========================================================================
-- Migration 010: Enable RLS + tenant isolation policies (the big one)
-- ==========================================================================
-- Purpose:
--   Phase A 的最後一支也是最關鍵的 migration —
--   為所有業務表啟用 Row-Level Security，並建立 tenant 隔離 policies。
--
--   完成後 schema audit §5 發現的「RLS 失效」問題全部解決：
--     - 7 張關鍵表（users / students / profiles 等）有 policy 但 RLS 沒開
--     → 套用本 migration 後，全部都會以 RLS 強制隔離
--
-- References:
--   - v3.0 §10.6 Supabase RLS（v3.0 補強重點）
--   - docs/week0-tech-decisions.md 決議 2 JWT custom claim
--   - docs/week0-schema-audit.md §5 RLS 失效現況
--
-- Strategy:
--   1. 為所有表先 DROP 既有 policies（74 條，多數已失效或不正確）
--   2. 為每張表 ENABLE ROW LEVEL SECURITY
--   3. 建立 3 套標準 policies for 每張業務表：
--      a. tenant_isolation_select  — 只能讀自己 tenant 的資料
--      b. tenant_isolation_modify  — 只能寫入/修改/刪除自己 tenant
--      c. platform_admin_bypass    — platform_admin role 不受 tenant 限制
--   4. 特殊表（tenants 自身、ai_usage_log）另外處理
--
-- Pre-requisite:
--   ⚠️ 套用此 migration 前，Supabase Auth Hook 必須已設定好，
--      讓 JWT 內含 `tenant_id` claim。
--   設定方法見 docs/supabase-auth-hook-setup.md（待 Telly 回國一起做）
--
-- Risk: 🔴 HIGH — 一旦啟用 RLS：
--   - 應用層所有 query 必須帶正確 JWT，否則「看不到任何資料」
--   - 任何漏配置 policy 的 case → 該操作被拒
--   緩解：在 preview branch 套用後跑完整 e2e 測試確認，再上 production
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- ==========================================================================
-- Step 1: Drop ALL existing policies (清空 74 條 legacy policies)
-- ==========================================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
    RAISE NOTICE 'Dropped legacy policy: %.% [%]', pol.schemaname, pol.tablename, pol.policyname;
  END LOOP;
END $$;


-- ==========================================================================
-- Step 2: Helper — get current user's tenant_id from JWT
-- ==========================================================================
-- JWT 內由 Supabase Auth Hook 注入：{ ..., "tenant_id": "<uuid>", "role": "..." }
-- 這個 helper 函式被所有 policy 共用

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (auth.jwt() ->> 'tenant_id')::UUID;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(auth.jwt() ->> 'role', 'unauthenticated');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.current_user_role() = 'platform_admin';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ==========================================================================
-- Step 3: Enable RLS + standard policies for business tables
-- ==========================================================================
DO $$
DECLARE
  target_tables TEXT[] := ARRAY[
    'announcement_reads', 'announcements', 'attendance_records',
    'audit_logs', 'chat_messages', 'contact_books', 'course_sessions',
    'exam_results', 'leave_requests', 'payment_records', 'pickup_requests',
    'role_configs', 'schedule_slots', 'student_link_requests',
    'student_progress_notes', 'students', 'teacher_assignments',
    'operational_events', 'access_log', 'consent_records'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    -- Skip tables that don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE 'Skipping non-existent table: %', tbl;
      CONTINUE;
    END IF;

    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- SELECT: same tenant OR platform_admin
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT
        USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
    $f$, tbl || '_select_tenant', tbl);

    -- INSERT: must write into own tenant
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR INSERT
        WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
    $f$, tbl || '_insert_tenant', tbl);

    -- UPDATE: same tenant in both old and new row
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR UPDATE
        USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
        WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
    $f$, tbl || '_update_tenant', tbl);

    -- DELETE: same tenant
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR DELETE
        USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin())
    $f$, tbl || '_delete_tenant', tbl);

    RAISE NOTICE 'RLS enabled + 4 policies created for %', tbl;
  END LOOP;
END $$;


-- ==========================================================================
-- Step 4: USERS table — special handling
-- ==========================================================================
-- users 表的 policy 比業務表複雜：
-- - 平台管理員看所有 tenant 的 users
-- - tenant 內的 admin/director 看自己 tenant 的 users
-- - 一般使用者只看自己（id = auth.uid()）

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own row (anyone in their tenant or themselves)
CREATE POLICY users_select_self_or_tenant ON public.users
  FOR SELECT
  USING (
    id = auth.uid()
    OR tenant_id = public.current_tenant_id()
    OR public.is_platform_admin()
  );

-- Allow users to update only their own row (admins update via service_role)
CREATE POLICY users_update_self ON public.users
  FOR UPDATE
  USING (id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (id = auth.uid() OR public.is_platform_admin());

-- INSERT 由 Supabase Auth trigger 或 service_role 處理；
-- 一般 client 不能直接 INSERT users → 不建 client-side INSERT policy

-- DELETE 只有 platform_admin
CREATE POLICY users_delete_platform_admin ON public.users
  FOR DELETE
  USING (public.is_platform_admin());


-- ==========================================================================
-- Step 5: TENANTS table — special handling
-- ==========================================================================
-- 一般使用者：只能看自己的 tenant
-- platform_admin：可看/改所有 tenant

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select_own ON public.tenants
  FOR SELECT
  USING (id = public.current_tenant_id() OR public.is_platform_admin());

CREATE POLICY tenants_modify_platform_admin ON public.tenants
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());


-- ==========================================================================
-- Step 6: AI_USAGE_LOG table
-- ==========================================================================
-- 一般使用者：看自己 tenant 的成本
-- platform_admin：跨 tenant 看

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_log_select_tenant ON public.ai_usage_log
  FOR SELECT
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

-- INSERT 通常由 service_role 寫（後端 AI 呼叫紀錄）
CREATE POLICY ai_usage_log_insert_tenant ON public.ai_usage_log
  FOR INSERT
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_platform_admin());


-- ==========================================================================
-- Step 7: Verification
-- ==========================================================================
-- 套用後跑此檢查：
--   SELECT tablename, rowsecurity,
--     (SELECT count(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename
--      AND pg_policies.schemaname = 'public') AS policy_count
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
-- 預期：所有表 rls_enabled = true, policy_count >= 1


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- 一鍵 disable RLS 全部表（不刪 policies，只關閉 enforcement）：
-- DO $$
-- DECLARE tbl TEXT;
-- BEGIN
--   FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
--   END LOOP;
-- END $$;
--
-- 完整 rollback（刪所有 policies + functions）建議用 PITR
-- ==========================================================================
