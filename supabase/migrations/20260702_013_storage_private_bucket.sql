-- ==========================================================================
-- Migration 013: contact_photos bucket 轉私有（R7）
-- ==========================================================================
-- ⚠️⚠️ 不要單獨套用此檔 ⚠️⚠️
-- 現況：學生照片存公開 bucket，拿到 URL 的任何人永久可看（個資風險）。
-- 但程式碼目前用 getPublicUrl 顯示照片（contact-book／students／my-child），
-- bucket 一轉私有，所有已存在 DB 的公開 URL 立即失效。
--
-- 正確上線順序（規劃在封測後第一週）：
--   1. 程式碼改用 createSignedUrl（顯示時把 DB 存的 URL 轉成路徑再簽名）
--   2. 套用本檔
--   3. 驗證新舊照片都能正常顯示
--
-- 在此之前的緩解：上傳路徑含時間戳（不可猜測），且本檔的 INSERT policy
-- 可以先行套用（Section 2 可獨立執行，限制上傳者身分）。
-- ==========================================================================

-- Section 1: bucket 轉私有（⚠️ 需程式碼配合，見檔頭）
-- UPDATE storage.buckets SET public = false WHERE id = 'contact_photos';

-- Section 2: storage.objects policies（可先行套用）
DROP POLICY IF EXISTS "contact_photos_upload_staff" ON storage.objects;
CREATE POLICY "contact_photos_upload_staff" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'contact_photos' AND public.is_staff_member()
  );

DROP POLICY IF EXISTS "contact_photos_read_authenticated" ON storage.objects;
CREATE POLICY "contact_photos_read_authenticated" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'contact_photos' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "contact_photos_delete_staff" ON storage.objects;
CREATE POLICY "contact_photos_delete_staff" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'contact_photos' AND public.is_staff_member()
  );
