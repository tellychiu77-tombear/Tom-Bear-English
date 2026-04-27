create table if not exists payment_records (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references students(id) on delete cascade not null,
  amount numeric(10,2) not null,
  item text not null,        -- 學費、材料費、活動費、其他
  paid_date date not null,
  payment_method text not null default 'cash', -- cash, transfer, other
  status text not null default 'paid',         -- paid, pending, partial
  note text,
  recorded_by uuid references users(id),
  created_at timestamptz default now()
);
alter table payment_records enable row level security;
create policy "Enable all access for now" on payment_records for all using (true) with check (true);
