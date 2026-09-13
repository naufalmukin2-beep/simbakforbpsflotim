-- ============================================================
-- SIMBAK - SUPABASE SCHEMA
-- Jalankan seluruh file ini di: Supabase Dashboard > SQL Editor > New Query > Run
-- ============================================================

-- Pastikan extension uuid tersedia
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. TABEL PROFILES (data pegawai)
-- ------------------------------------------------------------
-- Catatan desain: "id" adalah PK bebas (bisa diisi manual utk data dummy demo),
-- sedangkan "user_id" hanya terisi kalau baris ini terhubung ke akun Google
-- yang benar-benar login. Jadi data dummy pegawai (utk demo) tetap bisa ada
-- walau belum pernah login, dan akun Google asli kamu otomatis jadi baris baru.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text,
  full_name text,
  nip text,
  tim_kerja text,
  jabatan text,
  avatar_url text,
  is_admin boolean not null default false,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. TABEL ACTIVITIES (kegiatan ABK)
-- ------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  norma_waktu numeric not null,
  norma_unit text not null default 'jam' check (norma_unit in ('jam', 'menit')),
  volume numeric not null,
  start_date timestamptz,
  end_date timestamptz,
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TRIGGER: auto-buat baris profile saat ada login Google baru
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, email, full_name, avatar_url, profile_completed)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    false
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- Untuk demo besok: dibuat permisif dulu (semua user login boleh baca &
-- kelola activities). Nanti tinggal dipersempit sesuai roadmap Tahap 3
-- (staff hanya bisa ubah miliknya, admin full access) -- contoh policy
-- yang lebih ketat ada di komentar paling bawah file ini.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.activities enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "activities_select_authenticated" on public.activities;
create policy "activities_select_authenticated"
  on public.activities for select
  using (auth.role() = 'authenticated');

drop policy if exists "activities_insert_authenticated" on public.activities;
create policy "activities_insert_authenticated"
  on public.activities for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "activities_update_authenticated" on public.activities;
create policy "activities_update_authenticated"
  on public.activities for update
  using (auth.role() = 'authenticated');

drop policy if exists "activities_delete_authenticated" on public.activities;
create policy "activities_delete_authenticated"
  on public.activities for delete
  using (auth.role() = 'authenticated');

-- ============================================================
-- Setelah kamu login pertama kali via Google di app, jalankan ini
-- (ganti email) supaya akun kamu jadi Admin/Kasubag:
--
-- update public.profiles set is_admin = true where email = 'emailkamu@gmail.com';
-- ============================================================

-- ------------------------------------------------------------
-- CONTOH policy lebih ketat untuk Tahap 3 (JANGAN dijalankan sekarang,
-- simpan dulu untuk pengembangan setelah demo):
--
-- create policy "activities_update_own_or_admin" on public.activities
--   for update using (
--     exists (select 1 from public.profiles p where p.id = assignee_id and p.user_id = auth.uid())
--     or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
--   );
-- ------------------------------------------------------------
