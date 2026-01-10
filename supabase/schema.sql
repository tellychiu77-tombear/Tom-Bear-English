-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Table (Linked to Supabase Auth)
create table users (
  id uuid references auth.users not null primary key,
  role text check (role in ('admin', 'director', 'manager', 'teacher', 'parent', 'admin_staff', 'pending')) default 'pending',
  department text check (department in ('english', 'after_school', 'general')),
  job_title text,
  name text,
  contact_info jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Students Table
create table students (
  id uuid default uuid_generate_v4() primary key,
  parent_id uuid references users(id) on delete cascade not null,
  name text not null,
  school_grade text,
  class_name text,
  photo_url text,
  english_name text,
  student_id_display text,
  birthday date,
  allergies text,
  health_notes text,
  parent_name_1 text,
  parent_phone_1 text,
  parent_name_2 text,
  parent_phone_2 text,
  pickup_method text,
  teacher_note text,
  internal_tags text[],
  profile_details jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Pick Up Queue Table (Core for Mom Call)
create table pick_up_queue (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references students(id) on delete cascade not null,
  status text check (status in ('pending', 'arrived', 'completed')) default 'pending',
  acc_timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable Realtime
alter publication supabase_realtime add table pick_up_queue;

-- 5. RLS Policies (Permissive for Dev)
alter table users enable row level security;
alter table students enable row level security;
alter table pick_up_queue enable row level security;

create policy "Enable all access for now" on users for all using (true) with check (true);
create policy "Enable all access for now" on students for all using (true) with check (true);
create policy "Enable all access for now" on pick_up_queue for all using (true) with check (true);


-- 6. Contact Books Table (Announcements)
create table contact_books (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Messages Table (Chat)
create table messages (
  id uuid default uuid_generate_v4() primary key,
  content text not null,
  sender_id uuid references users(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Exam Results Table (Grades)
create table exam_results (
  id uuid default uuid_generate_v4() primary key,
  student_name text not null,
  exam_name text not null,
  subject text not null,
  score numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Enable Realtime for new tables
alter publication supabase_realtime add table messages;
-- (Optional: add others if needed, but Chat is the main one requiring realtime)

-- 10. RLS Policies for new tables
alter table contact_books enable row level security;
alter table messages enable row level security;
alter table exam_results enable row level security;

create policy "Enable all access for now" on contact_books for all using (true) with check (true);
create policy "Enable all access for now" on messages for all using (true) with check (true);
create policy "Enable all access for now" on exam_results for all using (true) with check (true);

-- 11. Leave Requests Table
create table leave_requests (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references students(id) on delete cascade not null,
  type text not null, -- 病假, 事假, etc.
  reason text,
  start_date date not null,
  end_date date not null,
  status text check (status in ('pending', 'approved', 'rejected')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 12. Leave Requests View (Joined with Student Info)
create or replace view leave_requests_view as
select 
  lr.id,
  lr.student_id,
  s.name as student_name,
  s.parent_id,
  lr.type,
  lr.reason,
  lr.start_date,
  lr.end_date,
  lr.status,
  lr.created_at
from leave_requests lr
join students s on lr.student_id = s.id;

-- 13. Enable Realtime & RLS
alter publication supabase_realtime add table leave_requests;
alter table leave_requests enable row level security;
create policy "Enable all access for now" on leave_requests for all using (true) with check (true);

-- 14. RPC to get profile ID by email (Secure helper)
create or replace function get_profile_id_by_email(user_email text)
returns uuid
language sql
security definer
as $$
  select id from auth.users where email = user_email limit 1;
$$;


-- 15. Audit Logs Table
create table audit_logs (
  id uuid default uuid_generate_v4() primary key,
  action text not null,
  details text,
  user_id uuid references users(id) not null,
  user_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 16. Enable Realtime & RLS for Logs
alter publication supabase_realtime add table audit_logs;
alter table audit_logs enable row level security;
-- 17. Announcements System
create table announcements (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  content text not null,
  priority text check (priority in ('normal', 'urgent')) default 'normal',
  audience text check (audience in ('all', 'staff', 'parent')) default 'all',
  author_id uuid references users(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 18. Announcement Reads
create table announcement_reads (
  id uuid default uuid_generate_v4() primary key,
  announcement_id uuid references announcements(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  read_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(announcement_id, user_id)
);

-- 19. Enable Realtime & RLS for Announcements
alter publication supabase_realtime add table announcements;
alter table announcements enable row level security;
alter table announcement_reads enable row level security;

create policy "Enable all access for now" on announcement_reads for all using (true) with check (true);

-- 20. Contact Book Updates (Detailed)
drop table if exists contact_books;
create table contact_books (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references students(id) not null,
  date date default CURRENT_DATE,
  mood int check (mood between 1 and 3),
  focus int check (focus between 1 and 3),
  appetite int check (appetite between 1 and 3),
  homework text,
  comment text,
  photo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create policy "Enable all access for now" on contact_books for all using (true) with check (true);

-- 21. Class Assignments (for Teachers)
create table class_assignments (
  id uuid default uuid_generate_v4() primary key,
  teacher_id uuid references users(id) not null,
  class_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table class_assignments enable row level security;
create policy "Enable all access for now" on class_assignments for all using (true) with check (true);

-- 22. Parent Student Link View (Virtual Table)
create or replace view parent_student_link as
select 
  parent_id, 
  id as student_id 
from students 
where parent_id is not null;

-- 23. Add class_name to students if not exists (Executed conditionally usually, but here we just document it or add column)
-- Note: 'alter table students add column class_name text;' should be run if not exists. 
-- Since this is a schema definition file, I'll add it to the students table definition up top or alter here.
-- I will strictly follow the "append" pattern for safe migrations in this context or editing the original table if I can.
-- However, editing line 20 (students) is better. 
-- But since I am using replace_file_content on the end, I will use an ALTER statement here to be safe for existing deployments.
alter table students add column if not exists class_name text;
