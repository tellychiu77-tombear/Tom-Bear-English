-- 課程進度記錄
create table if not exists course_sessions (
  id uuid default uuid_generate_v4() primary key,
  class_group text not null,
  date date not null,
  topic text not null,          -- 本節教學主題
  content text,                  -- 教學內容摘要
  homework text,                 -- 作業內容
  homework_due date,             -- 作業截止日
  teacher_id uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 學生個別進度（選填）
create table if not exists student_progress_notes (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references course_sessions(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  homework_status text default 'pending', -- completed, incomplete, pending
  note text,
  created_at timestamptz default now(),
  unique(session_id, student_id)
);

alter table course_sessions enable row level security;
create policy "Enable all for now" on course_sessions for all using (true) with check (true);
alter table student_progress_notes enable row level security;
create policy "Enable all for now" on student_progress_notes for all using (true) with check (true);
