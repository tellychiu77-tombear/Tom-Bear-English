-- ============================================================
-- 排課系統 Migration
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ============================================================

-- 1. 在 users 表新增老師類型與可來天數
alter table users add column if not exists teacher_type text check (teacher_type in ('foreign', 'external', 'staff'));
alter table users add column if not exists available_days int[] default '{}';

-- 2. 老師負責設定表
create table if not exists teacher_assignments (
  id uuid default uuid_generate_v4() primary key,
  teacher_id uuid references users(id) on delete cascade not null,
  class_group text not null,
  slot_type text not null check (slot_type in ('聽說', '文法', '閱讀', '英文綜合', '課後輔導')),
  role text not null check (role in ('lead', 'assistant')) default 'lead',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(teacher_id, class_group, slot_type, role)
);

alter table teacher_assignments enable row level security;
create policy "Enable all access for teacher_assignments" on teacher_assignments for all using (true) with check (true);

-- 3. 排課表
create table if not exists schedule_slots (
  id uuid default uuid_generate_v4() primary key,
  semester text not null default '2025下',
  class_group text not null,
  slot_type text not null check (slot_type in ('聽說', '文法', '閱讀', '英文綜合', '課後輔導')),
  lead_teacher_id uuid references users(id) on delete set null,
  assistant_teacher_id uuid references users(id) on delete set null,
  day_of_week int not null check (day_of_week between 1 and 5),
  start_time time not null,
  end_time time,
  note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table schedule_slots enable row level security;
create policy "Enable all access for schedule_slots" on schedule_slots for all using (true) with check (true);
