-- ==========================================================================
-- Migration 011: RPC helper functions referenced by backend-conventions.md
-- ==========================================================================
-- Purpose:
--   backend-conventions.md §3-5 提到一系列 RPC functions 讓應用層可以：
--     - 設定 session-level encryption key（set_session_keys）
--     - 讀取解密後的學生資料（get_students_decrypted）
--     - 用 hash 搜尋學生（search_student_by_chinese_name 等）
--     - 寫入加密學生資料（insert_student_with_encryption）
--   這支 migration 把這些 functions 全部建立。
--
-- References:
--   - docs/backend-conventions.md §3-5
--   - migration 008（加密 helpers）、009（search hash helpers）
--
-- Risk: 🟢 LOW — 純新增 SECURITY DEFINER functions，不改資料。
--   但 SECURITY DEFINER 需謹慎：function 內部用 function owner 權限，
--   可能繞過 RLS。所有 functions 內部都有手動加 tenant filter 確認。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- ==========================================================================
-- A. Session key management
-- ==========================================================================
-- 應用層每個 server-side connection 開頭呼叫一次，把 encryption key 與
-- hash key 寫進 session variable，後續 encrypt_pii / decrypt_pii / hash_for_search
-- 都會用到（在 migration 008 與 009 建立）。

CREATE OR REPLACE FUNCTION public.set_session_keys(
  p_encryption_key TEXT,
  p_hash_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER  -- 用 function owner 權限
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_encryption_key IS NULL OR p_encryption_key = '' THEN
    RAISE EXCEPTION 'set_session_keys: p_encryption_key cannot be null or empty';
  END IF;
  IF p_hash_key IS NULL OR p_hash_key = '' THEN
    RAISE EXCEPTION 'set_session_keys: p_hash_key cannot be null or empty';
  END IF;

  -- true = local to current transaction
  PERFORM set_config('app.encryption_key', p_encryption_key, true);
  PERFORM set_config('app.hash_key', p_hash_key, true);
END;
$$;

COMMENT ON FUNCTION public.set_session_keys IS
  'Sets per-transaction encryption + hash keys. Call once at the start of each server-side connection.';


-- ==========================================================================
-- B. Read RPCs — decrypt and return safe view
-- ==========================================================================

-- B.1 取得單一學生（解密後）
CREATE OR REPLACE FUNCTION public.get_student_decrypted(p_student_id UUID)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  chinese_name TEXT,
  english_name TEXT,
  primary_contact_phone TEXT,
  primary_contact_relationship TEXT,
  secondary_contact_phone TEXT,
  secondary_contact_relationship TEXT,
  birthday DATE,
  grade TEXT,
  school_grade TEXT,
  pickup_method TEXT,
  allergies TEXT,
  special_needs TEXT,
  learning_goal TEXT,
  photo_url TEXT,
  strength_tags TEXT[],
  improvement_tags TEXT[],
  teacher_assessment TEXT,
  level TEXT,
  join_date DATE,
  internal_note TEXT,
  parent_id UUID,
  parent_id_2 UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
BEGIN
  caller_tenant := public.current_tenant_id();
  caller_role := public.current_user_role();

  -- 手動加 tenant filter（雖然 RLS 也會擋，但 SECURITY DEFINER 會繞過 RLS）
  RETURN QUERY
  SELECT
    s.id,
    s.tenant_id,
    public.decrypt_pii(s.chinese_name_encrypted),
    public.decrypt_pii(s.english_name_encrypted),
    public.decrypt_pii(s.primary_contact_phone_encrypted),
    s.primary_contact_relationship,
    public.decrypt_pii(s.secondary_contact_phone_encrypted),
    s.secondary_contact_relationship,
    public.decrypt_pii(s.birthday_encrypted)::DATE,
    s.grade,
    s.school_grade,
    s.pickup_method,
    public.decrypt_pii(s.allergies_encrypted),
    public.decrypt_pii(s.special_needs_encrypted),
    public.decrypt_pii(s.learning_goal_encrypted),
    public.decrypt_pii(s.photo_url_encrypted),
    s.strength_tags,
    s.improvement_tags,
    s.teacher_assessment,
    s.level,
    s.join_date,
    s.internal_note,
    s.parent_id,
    s.parent_id_2,
    s.created_at
  FROM public.students s
  WHERE s.id = p_student_id
    AND (s.tenant_id = caller_tenant OR caller_role = 'platform_admin');
END;
$$;

COMMENT ON FUNCTION public.get_student_decrypted IS
  'Returns a single student record with PII decrypted. Enforces tenant isolation manually.';


-- B.2 列表學生（解密後）— 不解密 photo_url 等大欄位以提升效能
CREATE OR REPLACE FUNCTION public.list_students_decrypted()
RETURNS TABLE (
  id UUID,
  chinese_name TEXT,
  english_name TEXT,
  grade TEXT,
  school_grade TEXT,
  parent_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
BEGIN
  caller_tenant := public.current_tenant_id();
  caller_role := public.current_user_role();

  RETURN QUERY
  SELECT
    s.id,
    public.decrypt_pii(s.chinese_name_encrypted),
    public.decrypt_pii(s.english_name_encrypted),
    s.grade,
    s.school_grade,
    s.parent_id
  FROM public.students s
  WHERE (s.tenant_id = caller_tenant OR caller_role = 'platform_admin')
  ORDER BY s.grade NULLS LAST, public.decrypt_pii(s.chinese_name_encrypted);
END;
$$;


-- ==========================================================================
-- C. Search RPCs — hash-based exact match
-- ==========================================================================

-- C.1 用中文姓名搜尋（精確比對）
CREATE OR REPLACE FUNCTION public.search_student_by_chinese_name(p_search_input TEXT)
RETURNS TABLE (
  id UUID,
  chinese_name TEXT,
  english_name TEXT,
  grade TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
  search_h BYTEA;
BEGIN
  caller_tenant := public.current_tenant_id();
  caller_role := public.current_user_role();
  search_h := public.hash_for_search(p_search_input);

  RETURN QUERY
  SELECT
    s.id,
    public.decrypt_pii(s.chinese_name_encrypted),
    public.decrypt_pii(s.english_name_encrypted),
    s.grade
  FROM public.students s
  WHERE s.chinese_name_search_hash = search_h
    AND (s.tenant_id = caller_tenant OR caller_role = 'platform_admin')
  LIMIT 50;
END;
$$;


-- C.2 用電話搜尋
CREATE OR REPLACE FUNCTION public.search_student_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  chinese_name TEXT,
  matched_field TEXT  -- 'primary' or 'secondary'
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
  search_h BYTEA;
BEGIN
  caller_tenant := public.current_tenant_id();
  caller_role := public.current_user_role();
  search_h := public.hash_for_search(p_phone);

  RETURN QUERY
  SELECT
    s.id,
    public.decrypt_pii(s.chinese_name_encrypted),
    CASE
      WHEN s.primary_contact_phone_search_hash = search_h THEN 'primary'
      ELSE 'secondary'
    END::TEXT
  FROM public.students s
  WHERE (s.primary_contact_phone_search_hash = search_h
      OR s.secondary_contact_phone_search_hash = search_h)
    AND (s.tenant_id = caller_tenant OR caller_role = 'platform_admin')
  LIMIT 50;
END;
$$;


-- ==========================================================================
-- D. Write RPC — encryption-aware insert
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.insert_student_with_encryption(
  p_chinese_name TEXT,
  p_english_name TEXT DEFAULT NULL,
  p_primary_contact_phone TEXT DEFAULT NULL,
  p_primary_contact_relationship TEXT DEFAULT NULL,
  p_secondary_contact_phone TEXT DEFAULT NULL,
  p_secondary_contact_relationship TEXT DEFAULT NULL,
  p_birthday DATE DEFAULT NULL,
  p_grade TEXT DEFAULT NULL,
  p_school_grade TEXT DEFAULT NULL,
  p_pickup_method TEXT DEFAULT NULL,
  p_allergies TEXT DEFAULT NULL,
  p_special_needs TEXT DEFAULT NULL,
  p_learning_goal TEXT DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_id UUID;
  caller_tenant UUID;
BEGIN
  caller_tenant := public.current_tenant_id();

  IF caller_tenant IS NULL THEN
    RAISE EXCEPTION 'insert_student_with_encryption: tenant_id required in JWT';
  END IF;

  IF p_chinese_name IS NULL OR p_chinese_name = '' THEN
    RAISE EXCEPTION 'insert_student_with_encryption: chinese_name is required';
  END IF;

  INSERT INTO public.students (
    tenant_id,
    chinese_name_encrypted,
    chinese_name_search_hash,
    english_name_encrypted,
    english_name_search_hash,
    primary_contact_phone_encrypted,
    primary_contact_phone_search_hash,
    primary_contact_relationship,
    secondary_contact_phone_encrypted,
    secondary_contact_phone_search_hash,
    secondary_contact_relationship,
    birthday_encrypted,
    grade,
    school_grade,
    pickup_method,
    allergies_encrypted,
    special_needs_encrypted,
    learning_goal_encrypted,
    parent_id,
    join_date
  ) VALUES (
    caller_tenant,
    public.encrypt_pii(p_chinese_name),
    public.hash_for_search(p_chinese_name),
    public.encrypt_pii(p_english_name),
    public.hash_for_search(p_english_name),
    public.encrypt_pii(p_primary_contact_phone),
    public.hash_for_search(p_primary_contact_phone),
    p_primary_contact_relationship,
    public.encrypt_pii(p_secondary_contact_phone),
    public.hash_for_search(p_secondary_contact_phone),
    p_secondary_contact_relationship,
    public.encrypt_pii(p_birthday::TEXT),
    p_grade,
    p_school_grade,
    p_pickup_method,
    public.encrypt_pii(p_allergies),
    public.encrypt_pii(p_special_needs),
    public.encrypt_pii(p_learning_goal),
    p_parent_id,
    CURRENT_DATE
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.insert_student_with_encryption IS
  'Insert a student with PII automatically encrypted + search hashes generated. Tenant_id from JWT.';


-- ==========================================================================
-- E. Update RPC — encryption-aware update (single field example)
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.update_student_encrypted_field(
  p_student_id UUID,
  p_field_name TEXT,  -- 'chinese_name' | 'english_name' | 'primary_contact_phone' | ...
  p_new_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
  affected INTEGER;
BEGIN
  caller_tenant := public.current_tenant_id();
  caller_role := public.current_user_role();

  -- 限制可改的欄位（白名單防 SQL injection）
  IF p_field_name NOT IN (
    'chinese_name', 'english_name',
    'primary_contact_phone', 'secondary_contact_phone',
    'allergies', 'special_needs', 'learning_goal', 'photo_url'
  ) THEN
    RAISE EXCEPTION 'update_student_encrypted_field: invalid field name %', p_field_name;
  END IF;

  -- 動態 UPDATE — 同時更新加密欄位與 search_hash（若該欄位有 hash）
  IF p_field_name IN ('chinese_name', 'english_name',
                       'primary_contact_phone', 'secondary_contact_phone') THEN
    EXECUTE format(
      'UPDATE public.students SET %I = $1, %I = $2 WHERE id = $3 AND (tenant_id = $4 OR $5 = ''platform_admin'')',
      p_field_name || '_encrypted',
      p_field_name || '_search_hash'
    ) USING
      public.encrypt_pii(p_new_value),
      public.hash_for_search(p_new_value),
      p_student_id,
      caller_tenant,
      caller_role;
  ELSE
    -- 只更新加密欄位，無 search hash
    EXECUTE format(
      'UPDATE public.students SET %I = $1 WHERE id = $2 AND (tenant_id = $3 OR $4 = ''platform_admin'')',
      p_field_name || '_encrypted'
    ) USING
      public.encrypt_pii(p_new_value),
      p_student_id,
      caller_tenant,
      caller_role;
  END IF;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;


-- ==========================================================================
-- F. Grant permissions
-- ==========================================================================
-- 一般 authenticated user 可呼叫上述 functions
GRANT EXECUTE ON FUNCTION public.set_session_keys(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_decrypted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_students_decrypted() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_student_by_chinese_name(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_student_by_phone(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_student_with_encryption(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_encrypted_field(UUID, TEXT, TEXT) TO authenticated;


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- DROP FUNCTION IF EXISTS public.update_student_encrypted_field(UUID, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.insert_student_with_encryption(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.search_student_by_phone(TEXT);
-- DROP FUNCTION IF EXISTS public.search_student_by_chinese_name(TEXT);
-- DROP FUNCTION IF EXISTS public.list_students_decrypted();
-- DROP FUNCTION IF EXISTS public.get_student_decrypted(UUID);
-- DROP FUNCTION IF EXISTS public.set_session_keys(TEXT, TEXT);
-- ==========================================================================
