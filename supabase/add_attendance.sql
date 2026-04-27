-- 出缺席記錄表
create table if not exists attendance_records (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references students(id) on delete cascade not null,
  class_group text not null,
  date date not null,
  status text not null default 'present', -- present, absent, late, excused
  notes text,
  teacher_id uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, date, class_group)
);

alter table attendance_records enable row level security;
create policy "Enable all access for now" on attendance_records for all using (true) with check (true);
