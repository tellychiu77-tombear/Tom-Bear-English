-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Table (Linked to Supabase Auth)
create table users (
  id uuid references auth.users not null primary key,
  role text check (role in ('admin', 'director', 'manager', 'teacher', 'parent', 'pending')) default 'pending',
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
