-- ============================================================
-- Migration: 修正 FK 指向 profiles → users
-- 問題：pickup_requests 和 chat_messages 的外鍵錯誤指向 profiles 表
--       導致新家長/老師帳號無法使用這些功能
-- ============================================================

-- 1. 修正 pickup_requests.parent_id
ALTER TABLE pickup_requests
  DROP CONSTRAINT IF EXISTS pickup_requests_parent_id_fkey;

ALTER TABLE pickup_requests
  ADD CONSTRAINT pickup_requests_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE;

-- 2. 修正 chat_messages.sender_id
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_sender_id_fkey;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;

-- 3. 修正 chat_messages.receiver_id
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_receiver_id_fkey;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_receiver_id_fkey
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;

-- 完成後驗證（可選）
-- SELECT conname, confrelid::regclass AS referenced_table
-- FROM pg_constraint
-- WHERE conrelid = 'pickup_requests'::regclass AND contype = 'f';
