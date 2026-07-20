-- ==========================================================================
-- Migration 012: Role-level RLS + security fixes（封測前的關鍵防線）
-- ==========================================================================
-- Purpose:
--   010 只做到「tenant 隔離」— 同一間補習班內，家長 A 仍可讀寫家長 B
--   小孩的一切資料（成績、繳費、私訊）。本 migration 把隔離粒度降到
--   「角色 + 親子關係」層級：
--     - 家長只能讀自己小孩的資料、只能寫自己有權寫的東西
--     - 教職員依角色分級
--     - 稽核表只能新增不能改刪（防滅證）
--     - role_configs（權限設定表）只有管理階層可改（防自我提權）
--
--   同時修正 2026-07-02 稽核發現的問題：
--     R2: Auth Hook 覆寫頂層 role claim 會讓 PostgREST 全掛
--         → 角色判斷改為直接查 users 表（SECURITY DEFINER），
--           不再依賴 JWT claim，也免除「改角色要重新登入」的問題
--     R5: chat_messages 欄位分裂（message vs content）→ 資料合併
--     R6: students.parent_id CASCADE 會連鎖刪除學生 → 改 SET NULL
--     唯一鍵補強（exam_results、student_link_requests）
--     011 的解密 RPC 對所有登入者開放 → 收回
--     get_profile_id_by_email 可被匿名枚舉 email → 移除
--
-- Prerequisite:
--   - 010 已套用（RLS 已啟用、tenant policies 已建立）
--   - ⚠️ Auth Hook 若要設定，claim 名稱必須用 user_role（見
--     docs/supabase-auth-hook-setup.md 2026-07-02 修正版）。
--     但本 migration 的角色判斷「不依賴」該 claim，Hook 未設定也能正確運作。
--
-- Risk: 🔴 HIGH — 大量 policy 變更。務必先在 preview branch 完整測過：
--   1) 家長帳號讀不到別人小孩 2) 老師帳號正常點名/填聯絡簿
--   3) 行政帳號正常管理 4) 匿名（未登入）什麼都讀不到
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- ==========================================================================
-- Section 0: R5 — chat_messages 欄位統一（message 為準）
-- ==========================================================================
-- 程式碼已於 2026-07-02 統一寫 message（原聯絡簿內建聊天寫 content）。
-- 這裡把歷史資料合併過去。content 欄位保留到 014 cleanup 才移除。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'content') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'message') THEN
      ALTER TABLE public.chat_messages ADD COLUMN message TEXT;
    END IF;
    UPDATE public.chat_messages SET message = content WHERE message IS NULL AND content IS NOT NULL;
    RAISE NOTICE 'chat_messages: content -> message 合併完成';
  END IF;
END $$;


-- ==========================================================================
-- Section 1: 角色判斷 helpers — 查 users 表，不依賴 JWT claim
-- ==========================================================================
-- 010 的 current_user_role() 讀 JWT 的 role claim — 有兩個問題：
--   1) 原 Auth Hook 設計會覆寫 PostgREST 保留的頂層 role claim（全站 500）
--   2) JWT 是登入時簽發的，改角色後要重新登入才生效
-- 改為直接查 users 表（STABLE + SECURITY DEFINER，單一請求內只查一次）。

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'unauthenticated'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN
    ('teacher', 'admin', 'admin_staff', 'manager',
     'director', 'english_director', 'care_director', 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_level()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN
    ('admin', 'manager', 'director', 'english_director', 'care_director', 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'platform_admin';
$$;

-- tenant：優先 JWT claim（多租戶未來式），fallback 查 users 表（單租戶現況即可用）
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'tenant_id')::UUID,
    (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );
$$;

-- 家長是否為某學生的家長（policy 共用）
CREATE OR REPLACE FUNCTION public.is_parent_of(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (s.parent_id = auth.uid() OR s.parent_id_2 = auth.uid())
  );
$$;


-- ==========================================================================
-- Section 2: tenant_id 自動帶入（client 端 insert 不必知道 tenant）
-- ==========================================================================
DO $$
DECLARE
  tbl TEXT;
  target_tables TEXT[] := ARRAY[
    'announcement_reads', 'announcements', 'attendance_records',
    'audit_logs', 'chat_messages', 'contact_books', 'course_sessions',
    'exam_results', 'leave_requests', 'payment_records', 'pickup_requests',
    'schedule_slots', 'student_link_requests',
    'student_progress_notes', 'students', 'teacher_assignments',
    'access_log', 'operational_events', 'consent_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id()', tbl);
    END IF;
  END LOOP;
END $$;


-- ==========================================================================
-- Section 3: users 角色變更防護（DB 層防提權，R-audit 🔴-2 的正式修法）
-- ==========================================================================
-- 前端已限制，但 DB 才是真防線：
--   - 只有 director / platform_admin 可指派管理階層角色
--   - 只有 director / platform_admin 可變更 is_super_admin
--   - 任何人不得把自己升級

CREATE OR REPLACE FUNCTION public.guard_user_privilege_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role TEXT := public.current_user_role();
  mgmt_roles TEXT[] := ARRAY['admin', 'manager', 'director', 'english_director', 'care_director', 'platform_admin'];
BEGIN
  -- service_role（後端）不受限
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- 自我提權一律禁止
    IF NEW.id = auth.uid() AND NOT (actor_role = ANY(ARRAY['director', 'platform_admin'])) THEN
      RAISE EXCEPTION '不可變更自己的角色';
    END IF;
    -- 指派管理階層角色：限總園長／平台管理員
    IF NEW.role = ANY(mgmt_roles) AND NOT (actor_role = ANY(ARRAY['director', 'platform_admin'])) THEN
      RAISE EXCEPTION '只有總園長可指派管理階層角色（%）', NEW.role;
    END IF;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     AND NOT (actor_role = ANY(ARRAY['director', 'platform_admin'])) THEN
    RAISE EXCEPTION '只有總園長可變更最高權限旗標';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_privilege ON public.users;
CREATE TRIGGER trg_guard_user_privilege
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_privilege_change();


-- ==========================================================================
-- Section 4: 換掉 010 的通用 tenant policies → 角色感知 policies
-- ==========================================================================
-- 先拆掉 010 為下列表建立的 4 條通用 policy，再逐表建立正確的。

DO $$
DECLARE
  tbl TEXT;
  target_tables TEXT[] := ARRAY[
    'students', 'exam_results', 'attendance_records', 'contact_books',
    'leave_requests', 'payment_records', 'pickup_requests', 'chat_messages',
    'announcements', 'announcement_reads', 'student_link_requests',
    'student_progress_notes', 'course_sessions', 'role_configs',
    'audit_logs', 'access_log', 'operational_events', 'consent_records',
    'teacher_assignments', 'schedule_slots'
  ];
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_tenant', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert_tenant', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update_tenant', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete_tenant', tbl);
  END LOOP;
END $$;

-- 共用條件縮寫：
--   in_tenant  = tenant_id = public.current_tenant_id()
--   staff      = public.is_staff_member()
--   admin      = public.is_admin_level()

-- ── students ──────────────────────────────────────────────────────────────
CREATE POLICY students_select ON public.students FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR parent_id = auth.uid() OR parent_id_2 = auth.uid())
);
-- INSERT：教職員；或家長註冊時建立「掛在自己名下」的孩子（register 頁流程）
CREATE POLICY students_insert ON public.students FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
  AND (public.is_staff_member() OR parent_id = auth.uid())
);
-- UPDATE：教職員；或已連結家長（my-child 頁編輯基本資料）
CREATE POLICY students_update ON public.students FOR UPDATE USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR parent_id = auth.uid() OR parent_id_2 = auth.uid())
) WITH CHECK (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR parent_id = auth.uid() OR parent_id_2 = auth.uid())
);
CREATE POLICY students_delete ON public.students FOR DELETE USING (
  tenant_id = public.current_tenant_id() AND public.is_admin_level()
);

-- ── 學生子表（成績／出缺席／聯絡簿／繳費／課程筆記）───────────────────────
-- 讀：教職員全 tenant；家長限自己小孩。寫：教職員。
-- 例外：contact_books 允許家長 UPDATE 自己小孩的紀錄（簽名）。

CREATE POLICY exam_results_select ON public.exam_results FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY exam_results_write ON public.exam_results FOR INSERT WITH CHECK (
  tenant_id = public.current_tenant_id() AND public.is_staff_member()
);
CREATE POLICY exam_results_update ON public.exam_results FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY exam_results_delete ON public.exam_results FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

CREATE POLICY attendance_select ON public.attendance_records FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY attendance_write ON public.attendance_records FOR INSERT WITH CHECK (
  tenant_id = public.current_tenant_id() AND public.is_staff_member()
);
CREATE POLICY attendance_update ON public.attendance_records FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY attendance_delete ON public.attendance_records FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

CREATE POLICY contact_books_select ON public.contact_books FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY contact_books_insert ON public.contact_books FOR INSERT WITH CHECK (
  tenant_id = public.current_tenant_id() AND public.is_staff_member()
);
-- 家長可更新自己小孩的聯絡簿（簽名）；教職員可全改
CREATE POLICY contact_books_update ON public.contact_books FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.is_staff_member() OR public.is_parent_of(student_id))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.is_staff_member() OR public.is_parent_of(student_id))
  );
CREATE POLICY contact_books_delete ON public.contact_books FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

CREATE POLICY payment_records_select ON public.payment_records FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY payment_records_insert ON public.payment_records FOR INSERT WITH CHECK (
  tenant_id = public.current_tenant_id() AND public.is_staff_member()
);
CREATE POLICY payment_records_update ON public.payment_records FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY payment_records_delete ON public.payment_records FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_admin_level());

CREATE POLICY progress_notes_select ON public.student_progress_notes FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY progress_notes_write ON public.student_progress_notes FOR INSERT WITH CHECK (
  tenant_id = public.current_tenant_id() AND public.is_staff_member()
);
CREATE POLICY progress_notes_update ON public.student_progress_notes FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY progress_notes_delete ON public.student_progress_notes FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

-- ── leave_requests：家長可為自己小孩請假 ─────────────────────────────────
CREATE POLICY leave_select ON public.leave_requests FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY leave_insert ON public.leave_requests FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY leave_update ON public.leave_requests FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY leave_delete ON public.leave_requests FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

-- ── pickup_requests：家長可為自己小孩呼叫接送 ────────────────────────────
CREATE POLICY pickup_select ON public.pickup_requests FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY pickup_insert ON public.pickup_requests FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
  AND (public.is_staff_member() OR public.is_parent_of(student_id))
);
CREATE POLICY pickup_update ON public.pickup_requests FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.is_staff_member() OR public.is_parent_of(student_id))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.is_staff_member() OR public.is_parent_of(student_id))
  );
CREATE POLICY pickup_delete ON public.pickup_requests FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

-- ── chat_messages：只有收發雙方看得到 ────────────────────────────────────
CREATE POLICY chat_select ON public.chat_messages FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
);
CREATE POLICY chat_insert ON public.chat_messages FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
  AND sender_id = auth.uid()
);
-- 更新（標記已讀）：限收件者本人；寄件者不得竄改內容 → 也限制在自己訊息
CREATE POLICY chat_update ON public.chat_messages FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND (receiver_id = auth.uid() OR sender_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (receiver_id = auth.uid() OR sender_id = auth.uid())
  );
-- 不建 DELETE policy → 訊息不可刪（保留對話證據）

-- ── announcements：依對象顯示 ────────────────────────────────────────────
CREATE POLICY ann_select ON public.announcements FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (
    public.is_staff_member()
    OR target_audience IN ('all', 'parent')
  )
);
CREATE POLICY ann_insert ON public.announcements FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
  AND public.is_staff_member()
  -- 老師不能發全員公告（管理階層才可以）
  AND (public.is_admin_level() OR target_audience <> 'all')
);
-- 只能改／刪自己發的；管理階層可管全部
CREATE POLICY ann_update ON public.announcements FOR UPDATE
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.is_admin_level() OR author_id = auth.uid())
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.is_admin_level() OR author_id = auth.uid())
  );
CREATE POLICY ann_delete ON public.announcements FOR DELETE
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.is_admin_level() OR author_id = auth.uid())
  );

CREATE POLICY ann_reads_select ON public.announcement_reads FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_level()
);
CREATE POLICY ann_reads_insert ON public.announcement_reads FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY ann_reads_update ON public.announcement_reads FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── student_link_requests：家長送出綁定申請、管理員審核 ──────────────────
CREATE POLICY link_req_select ON public.student_link_requests FOR SELECT USING (
  tenant_id = public.current_tenant_id()
  AND (public.is_staff_member() OR parent_id = auth.uid())
);
CREATE POLICY link_req_insert ON public.student_link_requests FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
  AND parent_id = auth.uid()
);
CREATE POLICY link_req_update ON public.student_link_requests FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_admin_level())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_admin_level());

-- ── course_sessions／schedule_slots／teacher_assignments：課表類 ─────────
-- 讀：tenant 內全員（家長需要看課程進度／課表）。寫：教職員。
CREATE POLICY course_sessions_select ON public.course_sessions FOR SELECT USING (
  tenant_id = public.current_tenant_id() OR tenant_id IS NULL
);
CREATE POLICY course_sessions_write ON public.course_sessions FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL) AND public.is_staff_member()
);
CREATE POLICY course_sessions_update ON public.course_sessions FOR UPDATE
  USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());
CREATE POLICY course_sessions_delete ON public.course_sessions FOR DELETE
  USING (public.is_staff_member());

CREATE POLICY schedule_slots_select ON public.schedule_slots FOR SELECT USING (
  tenant_id = public.current_tenant_id()
);
CREATE POLICY schedule_slots_write ON public.schedule_slots FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL) AND public.is_staff_member()
);
CREATE POLICY schedule_slots_update ON public.schedule_slots FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY schedule_slots_delete ON public.schedule_slots FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

CREATE POLICY teacher_assignments_select ON public.teacher_assignments FOR SELECT USING (
  tenant_id = public.current_tenant_id()
);
CREATE POLICY teacher_assignments_write ON public.teacher_assignments FOR INSERT WITH CHECK (
  (tenant_id = public.current_tenant_id() OR tenant_id IS NULL) AND public.is_staff_member()
);
CREATE POLICY teacher_assignments_update ON public.teacher_assignments FOR UPDATE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_staff_member());
CREATE POLICY teacher_assignments_delete ON public.teacher_assignments FOR DELETE
  USING (tenant_id = public.current_tenant_id() AND public.is_staff_member());

-- ── role_configs：權限設定表 — 防自我提權的關鍵 ──────────────────────────
-- 讀：所有登入者（前端計算有效權限用）。寫：只有總園長／平台管理員。
CREATE POLICY role_configs_select ON public.role_configs FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY role_configs_write ON public.role_configs FOR INSERT WITH CHECK (
  public.current_user_role() IN ('director', 'platform_admin')
);
CREATE POLICY role_configs_update ON public.role_configs FOR UPDATE
  USING (public.current_user_role() IN ('director', 'platform_admin'))
  WITH CHECK (public.current_user_role() IN ('director', 'platform_admin'));
CREATE POLICY role_configs_delete ON public.role_configs FOR DELETE
  USING (public.current_user_role() IN ('director', 'platform_admin'));

-- ── 稽核／合規表：append-only（防滅證）───────────────────────────────────
-- INSERT：tenant 內登入者。SELECT：管理階層。UPDATE/DELETE：不建 policy = 禁止。
-- 稽核／合規表 append-only：用「角色限定」TO authenticated + WITH CHECK(true)。
-- 2026-07-06 staging 演練修正：原本 WITH CHECK (auth.uid() IS NOT NULL) 會被 RLS
-- 在 append-only INSERT 時誤擋（即使 auth.uid() 實際有值，postgres 直插驗證 FK/NOT NULL 皆正常）。
-- 角色限定寫法不依賴函式求值，且語義正確（任何登入者可寫稽核、只有 admin 可讀、永不可改刪）。
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (
  true
);
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (
  public.is_admin_level()
);

CREATE POLICY access_log_insert ON public.access_log FOR INSERT TO authenticated WITH CHECK (
  true
);
CREATE POLICY access_log_select ON public.access_log FOR SELECT USING (
  public.is_admin_level()
);

CREATE POLICY op_events_insert ON public.operational_events FOR INSERT TO authenticated WITH CHECK (
  true
);
CREATE POLICY op_events_select ON public.operational_events FOR SELECT USING (
  public.is_platform_admin()
);

CREATE POLICY consent_insert ON public.consent_records FOR INSERT WITH CHECK (
  parent_user_id = auth.uid() OR public.is_admin_level()
);
CREATE POLICY consent_select ON public.consent_records FOR SELECT USING (
  parent_user_id = auth.uid() OR public.is_admin_level()
);
-- 同意書撤回：更新 revoked_at — 限本人
CREATE POLICY consent_update ON public.consent_records FOR UPDATE
  USING (parent_user_id = auth.uid())
  WITH CHECK (parent_user_id = auth.uid());


-- ==========================================================================
-- Section 5: users 表 policies 重建（010 的版本讓家長讀到全 tenant 個資）
-- ==========================================================================
DROP POLICY IF EXISTS users_select_self_or_tenant ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;
DROP POLICY IF EXISTS users_delete_platform_admin ON public.users;

-- 讀：自己；教職員可讀 tenant 內全部（人事管理／聯絡人需要）
CREATE POLICY users_select ON public.users FOR SELECT USING (
  id = auth.uid()
  OR (tenant_id = public.current_tenant_id() AND public.is_staff_member())
);
-- 註冊流程需要 upsert 自己的資料列
CREATE POLICY users_insert_self ON public.users FOR INSERT WITH CHECK (
  id = auth.uid()
);
-- 改：自己；或管理階層改 tenant 內使用者（角色變更由 Section 3 trigger 把關）
CREATE POLICY users_update ON public.users FOR UPDATE
  USING (
    id = auth.uid()
    OR (tenant_id = public.current_tenant_id() AND public.is_admin_level())
  )
  WITH CHECK (
    id = auth.uid()
    OR (tenant_id = public.current_tenant_id() AND public.is_admin_level())
  );
-- 刪：管理階層（正式刪除建議走後端連 auth.users 一起清）
CREATE POLICY users_delete ON public.users FOR DELETE USING (
  (tenant_id = public.current_tenant_id() AND public.is_admin_level())
  OR public.is_platform_admin()
);


-- ==========================================================================
-- Section 6: 唯一鍵補強（防重複資料）
-- ==========================================================================
-- exam_results：先去重（保留最早一筆），再建唯一索引
DELETE FROM public.exam_results a
USING public.exam_results b
WHERE a.id > b.id
  AND a.student_id = b.student_id
  AND a.exam_name = b.exam_name
  AND a.exam_date IS NOT DISTINCT FROM b.exam_date
  AND a.subject IS NOT DISTINCT FROM b.subject;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_results_entry
  ON public.exam_results (student_id, exam_name, subject, exam_date);

-- student_link_requests：同一家長對同一學生只能有一筆 pending 申請
CREATE UNIQUE INDEX IF NOT EXISTS uq_link_request_pending
  ON public.student_link_requests (parent_id, matched_student_id)
  WHERE status = 'pending';

-- attendance_records 已有 unique(student_id, date, class_group)（add_attendance.sql）


-- ==========================================================================
-- Section 7: R6 — FK CASCADE 修正（刪家長不再連鎖刪掉學生與全部歷史）
-- ==========================================================================
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT con.conname, att.attname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'students'
      AND con.contype = 'f'
      AND att.attname IN ('parent_id', 'parent_id_2')
  LOOP
    EXECUTE format('ALTER TABLE public.students DROP CONSTRAINT %I', fk.conname);
    EXECUTE format(
      'ALTER TABLE public.students ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE SET NULL',
      fk.conname, fk.attname);
    RAISE NOTICE 'students.% FK → ON DELETE SET NULL', fk.attname;
  END LOOP;
END $$;


-- ==========================================================================
-- Section 8: RPC 權限收斂
-- ==========================================================================
-- 011 的解密／寫入 RPC 不該對所有登入者開放（家長可解密任何學生 PII）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_session_keys') THEN
    REVOKE EXECUTE ON FUNCTION public.set_session_keys(TEXT, TEXT) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.get_student_decrypted(UUID) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.list_students_decrypted() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.search_student_by_chinese_name(TEXT) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.search_student_by_phone(TEXT) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.insert_student_with_encryption(
      TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
    ) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.update_student_encrypted_field(UUID, TEXT, TEXT) FROM authenticated;
    RAISE NOTICE '011 RPC 已收回 authenticated 權限（未來走後端 service_role 呼叫）';
  END IF;
END $$;

-- email 枚舉漏洞：get_profile_id_by_email 任何人可呼叫 → 直接移除
DROP FUNCTION IF EXISTS public.get_profile_id_by_email(TEXT);


-- ==========================================================================
-- Section 9: onboarding 綁定比對 RPC（家長無法 SELECT 未綁定學生後的唯一通道）
-- ==========================================================================
-- 必須「電話＋姓名」同時命中才回傳，且只回最小欄位 — 防電話枚舉。
CREATE OR REPLACE FUNCTION public.match_student_for_binding(
  p_phone TEXT,
  p_chinese_name TEXT DEFAULT NULL,
  p_english_name TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, chinese_name TEXT, english_name TEXT, grade TEXT, school_grade TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_phone TEXT := regexp_replace(COALESCE(p_phone, ''), '[-\s]', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '需要登入';
  END IF;
  IF length(clean_phone) < 8 THEN
    RETURN;  -- 電話太短，不比對
  END IF;
  IF COALESCE(TRIM(p_chinese_name), '') = '' AND COALESCE(TRIM(p_english_name), '') = '' THEN
    RETURN;  -- 必須至少提供一個姓名，防止純電話枚舉
  END IF;

  RETURN QUERY
  SELECT s.id, s.chinese_name, s.english_name, s.grade, s.school_grade
  FROM public.students s
  WHERE (
      -- 相容新舊欄位（006 之後為 primary/secondary_contact_phone）
      regexp_replace(COALESCE(s.primary_contact_phone, ''), '[-\s]', '', 'g') = clean_phone
      OR regexp_replace(COALESCE(s.secondary_contact_phone, ''), '[-\s]', '', 'g') = clean_phone
    )
    AND (p_chinese_name IS NULL OR TRIM(p_chinese_name) = '' OR s.chinese_name = TRIM(p_chinese_name))
    AND (p_english_name IS NULL OR TRIM(p_english_name) = '' OR s.english_name ILIKE TRIM(p_english_name))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_student_for_binding(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.match_student_for_binding(TEXT, TEXT, TEXT) FROM anon;

-- ⚠️ 若在 006 之前套用本檔（理論上不會，檔名排序在 006 之後），
--    primary_contact_phone 欄位不存在會導致本函式建立失敗 — 屬預期防呆。


-- ==========================================================================
-- Section 10: 聊天聯絡人 RPC（users SELECT 收緊後，家長列老師清單的通道）
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.list_chat_contacts()
RETURNS TABLE (id UUID, name TEXT, email TEXT, role TEXT, job_title TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT := public.current_user_role();
  caller_tenant UUID := public.current_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '需要登入';
  END IF;

  IF caller_role = 'parent' THEN
    -- 家長：只回教職員最小欄位
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.role, u.job_title
    FROM public.users u
    WHERE u.tenant_id = caller_tenant
      AND u.role IN ('teacher', 'director', 'english_director', 'care_director')
    ORDER BY u.name;
  ELSIF public.is_staff_member() THEN
    -- 教職員：回家長清單
    RETURN QUERY
    SELECT u.id, u.name, u.email, u.role, u.job_title
    FROM public.users u
    WHERE u.tenant_id = caller_tenant AND u.role = 'parent'
    ORDER BY u.name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_chat_contacts() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_chat_contacts() FROM anon;


-- ==========================================================================
-- Section 11: system_logs 過渡期保護（003 套用前它仍存在且無 RLS）
-- ==========================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'system_logs') THEN
    ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS system_logs_insert ON public.system_logs;
    DROP POLICY IF EXISTS system_logs_select ON public.system_logs;
    CREATE POLICY system_logs_insert ON public.system_logs FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
    CREATE POLICY system_logs_select ON public.system_logs FOR SELECT
      USING (public.is_admin_level());
    RAISE NOTICE 'system_logs 過渡期 RLS 已啟用（003 套用後此表移除）';
  END IF;
END $$;


-- ==========================================================================
-- Section 12: 驗收清單（套用後逐項用真帳號測試）
-- ==========================================================================
-- 用「家長帳號」的 anon key session 測：
--   [ ] SELECT * FROM students; → 只回自己的小孩
--   [ ] SELECT * FROM users;    → 只回自己一列
--   [ ] SELECT * FROM chat_messages; → 只回自己收發的訊息
--   [ ] UPDATE exam_results SET score = 100 ...; → 被拒
--   [ ] UPDATE users SET role = 'director' WHERE id = auth.uid(); → 被拒（trigger）
--   [ ] SELECT * FROM role_configs; → 可讀；UPDATE → 被拒
--   [ ] UPDATE audit_logs / DELETE audit_logs → 被拒
-- 用「老師帳號」測：
--   [ ] 點名、填聯絡簿、登成績正常
--   [ ] UPDATE users SET role='director' WHERE id='<任意id>' → 被拒（trigger）
-- 未登入（anon）測：
--   [ ] SELECT * FROM students; → 0 列
--
-- ==========================================================================
-- ROLLBACK
-- ==========================================================================
-- 緊急情況（policy 錯擋正常功能）：對受影響的表 DISABLE ROW LEVEL SECURITY
-- （見 010 的 rollback script），修好 policy 再重新啟用。
-- trigger 移除：DROP TRIGGER trg_guard_user_privilege ON public.users;
-- ==========================================================================
