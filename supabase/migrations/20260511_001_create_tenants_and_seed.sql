-- ==========================================================================
-- Migration 001: Create tenants master table + seed Tom Bear as first tenant
-- ==========================================================================
-- Purpose:
--   建立 multi-tenant 架構的根實體 `tenants` 表。所有業務表會在後續
--   migration（007）加上 tenant_id FK 指向這張表。Tom Bear 補習班會被
--   建立為第一個 tenant（platform tenant 0001）。
--
-- References:
--   - Tom_Bear_AI化優化報告_v3.0.md §10.3 工作項目 1：建立 tenants 主表
--   - docs/week0-tech-decisions.md 決議 4 雙資料池架構
--
-- Changes:
--   1. CREATE TABLE tenants
--   2. INSERT Tom Bear (short_code='tombear', plan='trial')
--   3. CREATE INDEX tenants_short_code_idx
--
-- Risk: 🟢 LOW — 純新增 table 與一筆 seed 資料，不影響任何既有表或資料。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================

-- Step 1: Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 基本資料
  name VARCHAR(200) NOT NULL,
  short_code VARCHAR(20) NOT NULL UNIQUE,   -- e.g., 'tombear', 'clientB' — 用於 path-based URL
  type VARCHAR(20) NOT NULL DEFAULT 'cram_school',  -- 'cram_school' | 'kindergarten'

  -- 聯絡資訊
  contact_email VARCHAR(200),
  contact_phone VARCHAR(20),
  address TEXT,

  -- 商業資訊
  plan VARCHAR(20) NOT NULL DEFAULT 'trial',  -- 'trial' | 'small' | 'medium' | 'large' | 'platform'
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'cancelled'
  monthly_fee_twd INTEGER NOT NULL DEFAULT 0,

  -- 法律相關（DPA + 服務條款）
  signed_dpa_at TIMESTAMPTZ,
  signed_terms_at TIMESTAMPTZ,

  -- AI 使用上限（為 8 月後 AI 化階段預埋；Phase A-D 期間不會用到）
  monthly_ai_token_limit BIGINT NOT NULL DEFAULT 500000,
  current_month_ai_tokens_used BIGINT NOT NULL DEFAULT 0,

  -- 客戶專屬設定（避免在程式碼 hardcode）
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 時間戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tenants IS
  'Multi-tenant root entity. Each row represents one customer (補習班). Tom Bear is tenant 0001.';
COMMENT ON COLUMN public.tenants.short_code IS
  'URL-friendly identifier used in path-based routing, e.g., /tombear/students';
COMMENT ON COLUMN public.tenants.plan IS
  'Subscription tier — affects AI token limits and feature flags.';
COMMENT ON COLUMN public.tenants.settings IS
  'Per-tenant customization (branding, operations, academic config). Avoids hardcoding in app code.';

-- Step 2: Index for fast short_code lookups (used by tenant resolution middleware)
CREATE INDEX IF NOT EXISTS idx_tenants_short_code ON public.tenants(short_code);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- Step 3: Seed Tom Bear as the first tenant
-- 注意：此 INSERT 是 idempotent — 若已存在 short_code='tombear' 則不重複插入
INSERT INTO public.tenants (
  name,
  short_code,
  type,
  plan,
  status,
  monthly_ai_token_limit,
  settings
)
VALUES (
  '湯貝爾 / Tom Bear 美語補習班',
  'tombear',
  'cram_school',
  'platform',           -- platform tier — internal usage, unlimited
  'active',
  5000000,              -- 5M tokens/月，內部使用
  jsonb_build_object(
    'branding', jsonb_build_object(
      'school_name', '湯貝爾 美語補習班',
      'platform_brand', 'Intelligent Kids',
      'primary_color', '#2D5F3F'
    ),
    'operations', jsonb_build_object(
      'default_class_size', 15,
      'school_hours_start', '14:00',
      'school_hours_end', '21:00'
    ),
    'academic', jsonb_build_object(
      'grade_system', 'percentage',
      'term_structure', 'semester'
    ),
    'communication', jsonb_build_object(
      'default_language', 'zh-TW',
      'line_notify_enabled', false
    ),
    'ai_features', jsonb_build_object(
      'observation_note_enabled', false,
      'parent_chat_draft_enabled', false,
      'weekly_report_enabled', false,
      'note', 'All AI features disabled until 2026-08 per v3.0 plan'
    )
  )
)
ON CONFLICT (short_code) DO NOTHING;

-- Step 4: Trigger to auto-update updated_at column
CREATE OR REPLACE FUNCTION public.tenants_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tenants_set_updated_at();

-- Step 5: Verification (read-only, helps confirm seed worked)
-- 套用後手動跑這段檢查：
--   SELECT id, short_code, name, plan FROM public.tenants;
-- 應該看到一筆「tombear / 湯貝爾 / Tom Bear 美語補習班 / platform」


-- ==========================================================================
-- ROLLBACK SCRIPT (若這支 migration 出錯需要回退)
-- ==========================================================================
-- DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
-- DROP FUNCTION IF EXISTS public.tenants_set_updated_at();
-- DROP TABLE IF EXISTS public.tenants CASCADE;
--
-- ⚠️ CASCADE 會連帶刪除指向 tenants 的所有 FK — 只在 migration 001 出錯
--    且 002+ 還沒跑時才安全使用。如果 007 已套用，請改用 PITR 還原。
-- ==========================================================================
