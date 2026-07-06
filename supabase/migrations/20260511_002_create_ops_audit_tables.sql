-- ==========================================================================
-- Migration 002: Operational events / AI usage log / Access log / Consent records
-- ==========================================================================
-- Purpose:
--   建立 4 張為「研究 + 合規 + 未來 AI 化」服務的基礎表：
--     A. operational_events  — research-grade 行為事件池（雙資料池架構的第二池）
--     B. ai_usage_log        — 為 2026-08 後 AI 化階段預埋（Phase A-D 不會用）
--     C. access_log          — 個資合規日誌（誰存取了什麼資料、什麼時候）
--     D. consent_records     — 家長同意書紀錄（含「研究目的揭露」）
--
-- References:
--   - week0-tech-decisions.md 決議 4「雙資料池架構」
--   - 設計原則第 8 條「每個 UI 都是觀察儀器」
--   - v3.0 報告 §6.2 個資合規四件事
--
-- Risk: 🟢 LOW — 純新增 table，不影響既有資料。
--
-- Rollback: 見檔案末尾。
-- ==========================================================================


-- ==========================================================================
-- A. operational_events — research-grade 行為事件池
-- ==========================================================================
-- 設計原則：寫入時就匿名化、結構化、含行為脈絡。
-- 這張表是「實體派觀察儀器」的物質基礎。
-- 詳見 docs/data-dictionary.md（Phase A 第 1 週建立）。

CREATE TABLE IF NOT EXISTS public.operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 事件本身
  event_type VARCHAR(100) NOT NULL,
  -- 例：'open_contact_book', 'fill_observation', 'send_message', 'view_grade'
  -- 完整 event_type 字典見 docs/data-dictionary.md

  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 結構化欄位（已匿名）。例：
  -- {"mood":4,"focus":3,"time_to_complete_seconds":45}
  -- 嚴禁放：學生姓名、家長姓名、電話、email、地址

  -- 行為者（匿名 ID 化）
  user_role VARCHAR(50) NOT NULL,
  -- 'teacher' | 'parent' | 'admin' | 'director' | 'platform_admin'
  user_anon_id UUID NOT NULL,
  -- 內部匿名 ID（不可回推到實際 user_id）
  -- 由應用層用 HMAC(user_id, secret) 產生；同一使用者跨 session 保持一致

  -- 行為脈絡（research-grade 維度）
  prior_event_type VARCHAR(100),
  -- 上一個動作（用於行為序列研究）

  time_since_prior_ms INTEGER,
  -- 距離上一動作的毫秒數

  session_id UUID,
  -- session 級匿名 ID（同一 session 內事件可串聯）

  -- 上下文標籤（協助分析但不識別個人）
  class_anon_code VARCHAR(50),
  -- 班別匿名代碼，例：'cls_a1b2c3'。不直接放 class_group 文字
  age_band VARCHAR(20),
  -- '6-7' | '8-9' | '10-11' | '12-13' | 'teen'。不存實際生日

  -- 時間
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.operational_events IS
  '匿名行為事件池（雙資料池架構的第二池）。對應 v3.0 §0.6 stealth 模式內部研究素材。寫入時必須匿名化。';
COMMENT ON COLUMN public.operational_events.event_payload IS
  '結構化事件 payload。嚴禁放 PII（學生姓名/家長電話/email 等）。違規寫入會被 RLS policy 拒絕（policy 在 010 建立）。';
COMMENT ON COLUMN public.operational_events.user_anon_id IS
  'HMAC-derived anonymous user identifier. Cannot be reversed to user_id without the platform secret.';

CREATE INDEX IF NOT EXISTS idx_op_events_tenant_event
  ON public.operational_events(tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_op_events_session
  ON public.operational_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_op_events_event_time
  ON public.operational_events(event_type, created_at DESC);


-- ==========================================================================
-- B. ai_usage_log — AI 化階段成本記錄（Phase A-D 不寫入，2026-08+ 才用）
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,  -- 觸發者；可為 NULL（cron job、scheduled task）

  -- 模組
  module_name VARCHAR(50) NOT NULL,
  -- 'observation_note' | 'parent_chat_draft' | 'weekly_report' | 'student_profile' | 'school_insight' | 'weakness_diagnosis'

  -- 模型
  model_used VARCHAR(50) NOT NULL,
  -- 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'openai-whisper-1'

  -- Tokens & cost
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_twd DECIMAL(10, 4) NOT NULL DEFAULT 0.0,

  -- 結果
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  duration_ms INTEGER,

  -- 時間
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_usage_log IS
  'AI API 呼叫成本記錄。每次呼叫 Anthropic/OpenAI 都要寫一筆。2026-08+ AI 化階段啟用。';

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_month
  ON public.ai_usage_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_module
  ON public.ai_usage_log(module_name, created_at DESC);


-- ==========================================================================
-- C. access_log — 個資合規日誌
-- ==========================================================================
-- 個資法要求紀錄「誰存取了什麼學生資料」。
-- 與既有的 audit_logs 不同：audit_logs 記管理操作，access_log 記資料存取。

CREATE TABLE IF NOT EXISTS public.access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Who
  actor_user_id UUID,
  actor_role VARCHAR(50),
  actor_ip TEXT,  -- 注意：IP 也算個資，未來考慮加密

  -- What
  resource_type VARCHAR(50) NOT NULL,
  -- 'student' | 'parent' | 'contact_book' | 'exam_result' | 'payment' | etc.
  resource_id UUID,
  action VARCHAR(20) NOT NULL,
  -- 'read' | 'list' | 'export' | 'modify' | 'delete'

  -- 補充
  query_params JSONB,
  -- 篩選條件等（可能含個資 — 慎用）

  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.access_log IS
  '個資合規存取日誌。任何讀取/修改/匯出學生與家長資料的動作都應寫一筆。保留至少 1 年。';

CREATE INDEX IF NOT EXISTS idx_access_log_tenant_time
  ON public.access_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_resource
  ON public.access_log(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_log_actor
  ON public.access_log(actor_user_id, created_at DESC);


-- ==========================================================================
-- D. consent_records — 家長同意書紀錄
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 同意人
  parent_user_id UUID NOT NULL,
  -- 之後加 FK 到 users.id（在 007 之後加）

  -- 同意內容
  consent_version VARCHAR(20) NOT NULL,
  -- 同意書版本，例：'1.0', '1.1' — 修改條款時版本升級
  consent_terms_url TEXT,
  -- 該版本的同意書全文連結（儲存在 Supabase Storage 或 CMS）

  -- 同意項目（細分）
  agreed_to_basic_data BOOLEAN NOT NULL DEFAULT FALSE,
  -- 基本資料（姓名、電話）
  agreed_to_ai_processing BOOLEAN NOT NULL DEFAULT FALSE,
  -- 同意資料傳給 AI 服務商處理（v3.0 §6.2「特別重要 1」）
  agreed_to_research_use BOOLEAN NOT NULL DEFAULT FALSE,
  -- 同意匿名統計用於系統改善與教育研究（v3.0 §6.2「特別重要 2」）

  -- 行為紀錄
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_ip TEXT,  -- 簽署時 IP，作為證據
  signed_user_agent TEXT,

  -- 撤回（家長隨時可撤回）
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.consent_records IS
  '家長個資同意書紀錄。每次同意/撤回都產生一筆，永久保留作為法律證據。';

CREATE INDEX IF NOT EXISTS idx_consent_tenant_parent
  ON public.consent_records(tenant_id, parent_user_id);
CREATE INDEX IF NOT EXISTS idx_consent_active
  ON public.consent_records(parent_user_id, revoked_at)
  WHERE revoked_at IS NULL;


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- DROP TABLE IF EXISTS public.consent_records CASCADE;
-- DROP TABLE IF EXISTS public.access_log CASCADE;
-- DROP TABLE IF EXISTS public.ai_usage_log CASCADE;
-- DROP TABLE IF EXISTS public.operational_events CASCADE;
-- ==========================================================================
