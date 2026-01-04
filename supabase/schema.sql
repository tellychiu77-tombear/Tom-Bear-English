-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Table (Linked to Supabase Auth)
create table users (
  id uuid references auth.users not null primary key,
  role text check (role in ('admin', 'teacher', 'parent')) default 'parent',
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

