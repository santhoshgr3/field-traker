-- =============================================
-- FIELD TRACKER — SUPABASE SCHEMA
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================

-- 1. USERS (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null check (role in ('admin', 'field')),
  phone text,
  created_at timestamptz default now()
);

-- 2. ATTENDANCE
create table public.attendance (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  check_in timestamptz default now(),
  check_out timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  date date default current_date
);

-- 3. LIVE LOCATIONS (current position only — one row per user)
create table public.locations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz default now()
);

-- 4. LOCATION HISTORY (every GPS ping saved — full trail)
create table public.location_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz default now()
);

create index location_history_user_date_idx
  on public.location_history (user_id, recorded_at desc);

-- 5. TASKS
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'in-progress', 'done')),
  photo_url text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. ACTIVITY LOGS (every event during work hours)
create table public.activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'check_in', 'check_out', 'task_started', 'task_completed', 'photo_uploaded'
  )),
  details jsonb default '{}',
  created_at timestamptz default now()
);

create index activity_logs_user_date_idx
  on public.activity_logs (user_id, created_at desc);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.locations enable row level security;
alter table public.location_history enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;

-- Profiles: users see own, admins see all
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Admins can view all profiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Attendance: employees log own, admins see all
create policy "Employees manage own attendance" on public.attendance
  for all using (auth.uid() = user_id);

create policy "Admins view all attendance" on public.attendance
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Locations: employees update own, admins see all
create policy "Employees update own location" on public.locations
  for all using (auth.uid() = user_id);

create policy "Admins view all locations" on public.locations
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Location history: employees insert own, admins see all
create policy "Employees insert own location history" on public.location_history
  for insert with check (auth.uid() = user_id);

create policy "Employees view own location history" on public.location_history
  for select using (auth.uid() = user_id);

create policy "Admins view all location history" on public.location_history
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Tasks: employees see assigned tasks, admins manage all
create policy "Employees view own tasks" on public.tasks
  for select using (auth.uid() = assigned_to);

create policy "Employees update own tasks" on public.tasks
  for update using (auth.uid() = assigned_to);

create policy "Admins manage all tasks" on public.tasks
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Activity logs: employees insert/view own, admins see all
create policy "Employees manage own activity logs" on public.activity_logs
  for all using (auth.uid() = user_id);

create policy "Admins view all activity logs" on public.activity_logs
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'New User'),
    coalesce(new.raw_user_meta_data->>'role', 'field')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- STORAGE BUCKET FOR PHOTOS
-- =============================================
insert into storage.buckets (id, name, public) values ('task-photos', 'task-photos', true);

create policy "Anyone can upload task photos" on storage.objects
  for insert with check (bucket_id = 'task-photos');

create policy "Anyone can view task photos" on storage.objects
  for select using (bucket_id = 'task-photos');

-- =============================================
-- MIGRATION (run if tables already exist)
-- =============================================
-- alter table public.tasks add column if not exists started_at timestamptz;
-- alter table public.tasks add column if not exists completed_at timestamptz;
