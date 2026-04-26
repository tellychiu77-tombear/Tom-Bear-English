-- ============================================================
-- 權限系統 Migration — 貼到 Supabase SQL Editor 執行
-- ============================================================

-- 1. users 表加欄位
alter table users add column if not exists extra_permissions jsonb default '{}';
alter table users add column if not exists email text;
alter table users add column if not exists is_approved boolean default false;

-- 2. 職位預設權限表
create table if not exists role_configs (
  role text primary key,
  permissions jsonb default '{}',
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

alter table role_configs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'role_configs' and policyname = 'Enable all access for now'
  ) then
    create policy "Enable all access for now" on role_configs for all using (true) with check (true);
  end if;
end $$;

-- 3. 插入各職位預設值
insert into role_configs (role, permissions) values
  ('director',         '{"manageAnnouncements":true,"viewAllStudents":true,"editStudents":true,"approveLeave":true,"viewGrades":true,"editGrades":true,"fillContactBook":true,"viewPickupQueue":true,"viewManagerDashboard":true,"manageUsers":true,"chatWithParents":true}'),
  ('english_director', '{"manageAnnouncements":true,"viewAllStudents":true,"editStudents":true,"approveLeave":true,"viewGrades":true,"editGrades":true,"fillContactBook":true,"viewPickupQueue":true,"viewManagerDashboard":true,"manageUsers":true,"chatWithParents":true}'),
  ('care_director',    '{"manageAnnouncements":true,"viewAllStudents":true,"editStudents":true,"approveLeave":true,"viewGrades":true,"editGrades":true,"fillContactBook":true,"viewPickupQueue":true,"viewManagerDashboard":true,"manageUsers":true,"chatWithParents":true}'),
  ('admin',            '{"manageAnnouncements":true,"viewAllStudents":true,"editStudents":false,"approveLeave":true,"viewGrades":true,"editGrades":false,"fillContactBook":false,"viewPickupQueue":true,"viewManagerDashboard":false,"manageUsers":true,"chatWithParents":true}'),
  ('teacher',          '{"manageAnnouncements":true,"viewAllStudents":false,"editStudents":false,"approveLeave":true,"viewGrades":true,"editGrades":true,"fillContactBook":true,"viewPickupQueue":true,"viewManagerDashboard":false,"manageUsers":false,"chatWithParents":true}'),
  ('manager',          '{"manageAnnouncements":true,"viewAllStudents":true,"editStudents":true,"approveLeave":true,"viewGrades":true,"editGrades":true,"fillContactBook":true,"viewPickupQueue":true,"viewManagerDashboard":true,"manageUsers":true,"chatWithParents":true}')
on conflict (role) do nothing;

-- 完成！
select 'Migration 完成 ✅' as status;
