-- ==========================================================================
-- Migration 003: Drop dead / duplicate / type-mismatched tables
-- ==========================================================================
-- Purpose:
--   清理 schema audit 發現的 dead/重複/型態錯誤的表。所有要 drop 的表
--   row_count 都是 0，drop 不會損失任何資料。
--
-- References:
--   - docs/week0-schema-audit.md §3 (profiles vs users)
--   - docs/week0-schema-audit.md §4 (6 張 student_id 型態錯誤的表)
--   - docs/week0-schema-audit.md §2.2 (BLUEPRINT 漏記的表)
--   - Telly 2026-05-08 授權 Q3-7 = 採用 Claude 建議
--
-- Changes (drop 順序避免 FK 衝突)：
--   1. DROP VIEW messages_view             — depends on messages
--   2. DROP TABLE class_assignments        — 0 rows, no FK refs to it
--   3. DROP TABLE classes                  — 0 rows, but /staff 在用 (待 005 後修)
--   4. DROP TABLE daily_reports            — 0 rows, 被 contact_books 取代
--   5. DROP TABLE grades                   — 0 rows, 被 exam_results 取代
--   6. DROP TABLE parent_student_link      — 0 rows, type error (bigint)
--   7. DROP TABLE pick_up_queue            — 0 rows, 舊版接送
--   8. DROP TABLE pickups                  — 0 rows, 第三套接送
--   9. DROP TABLE messages                 — 0 rows, 被 chat_messages 取代
--   10. DROP TABLE system_logs             — 10 rows BUT Telly 已授權保留 audit_logs
--
-- 注意 contact_books 不在這支 drop！因為要保留結構與既有設計、只修正型態。
--      → 在 005 重建。
--
-- Risk: 🟡 MEDIUM — system_logs 有 10 rows 資料會丟。
--   緩解：套用前已 export CSV（見 PRE_FLIGHT_CHECKLIST.md 第 3 點）
--
-- Rollback: 見檔案末尾（只列 schema 復原，10 行 system_logs 資料無法救回）
-- ==========================================================================


-- Step 1: Drop view first (depends on messages table)
DROP VIEW IF EXISTS public.messages_view CASCADE;

-- Step 2-9: Drop dead tables that have 0 rows
-- 順序依 FK 相依：被依賴的表後 drop
DROP TABLE IF EXISTS public.class_assignments CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;
DROP TABLE IF EXISTS public.daily_reports CASCADE;
DROP TABLE IF EXISTS public.grades CASCADE;
DROP TABLE IF EXISTS public.parent_student_link CASCADE;
DROP TABLE IF EXISTS public.pick_up_queue CASCADE;
DROP TABLE IF EXISTS public.pickups CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;

-- Step 10: Drop system_logs (Telly 授權保留 audit_logs，drop 重複的 system_logs)
-- ⚠️ 套用前必須先 CSV export system_logs（裡頭有 10 筆操作紀錄）
DROP TABLE IF EXISTS public.system_logs CASCADE;


-- Step 11: Verification — 應該只看到「保留下來」的業務表
-- 套用後手動跑這段檢查：
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
--   ORDER BY table_name;
--
-- 預期結果（19 張表，含此 migration 之前已有的 + 001/002 新建的）：
--   announcement_reads, announcements, attendance_records, audit_logs,
--   chat_messages, contact_books, course_sessions, exam_results,
--   leave_requests, payment_records, pickup_requests, profiles,
--   role_configs, schedule_slots, student_link_requests,
--   student_progress_notes, students, teacher_assignments, users
--   + 001 新增: tenants
--   + 002 新增: operational_events, ai_usage_log, access_log, consent_records
--   = 共 24 張
-- 注意 profiles 還在 — 那是 004 才會 drop（要先處理 FK redirect）


-- ==========================================================================
-- ROLLBACK SCRIPT
-- ==========================================================================
-- 注意：schema 可以還原，但 system_logs 的 10 筆資料無法救回（除非 PITR）
-- 完整 rollback 需要重建這些表的 schema — 內容太多不列在此處
-- 建議用 PITR 直接還原到 migration 003 套用之前的時間點
-- 參考 PRE_FLIGHT_CHECKLIST.md
-- ==========================================================================
