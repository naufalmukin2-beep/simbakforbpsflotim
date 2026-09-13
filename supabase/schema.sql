-- ============================================================
-- SIMBAK - SUPABASE SCHEMA (v2 - RESET BERSIH)
-- Jalankan SELURUH file ini di: Supabase Dashboard > SQL Editor > New Query > Run
--
-- File ini akan:
-- 1. Menghapus tabel & trigger LAMA (kalau ada) -- termasuk data lama.
-- 2. Membuat ulang tabel profiles & activities, KOSONG (tanpa data dummy).
-- 3. Memasang aturan: Login Google HANYA untuk 1 email admin. Pegawai lain
--    WAJIB daftar manual (email asli + password).
-- 4. Memasang Row Level Security (RLS) yang jelas hak aksesnya.
--
-- >>> WAJIB: ganti email di bawah ini dengan email Google asli kamu <<<
-- ============================================================

-- ------------------------------------------------------------
-- 0. GANTI INI SESUAI EMAIL GOOGLE ADMIN KAMU
-- ------------------------------------------------------------
-- (dipakai berulang kali di bawah lewat fungsi ini, jadi cukup ganti di 1 tempat)
create or replace function public.admin_email()
returns text
language sql
immutable
as $$
  select 'naufalmukin2@gmail.com'
$$;

-- ------------------------------------------------------------
-- 1. BERSIH-BERSIH TABEL & TRIGGER LAMA
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.activities cascade;
drop table if exists public.profiles cascade;

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 2. TABEL PROFILES (data pegawai)
-- ------------------------------------------------------------
create table public.profiles (
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
-- 3. TABEL ACTIVITIES (kegiatan ABK)
-- ------------------------------------------------------------
create table public.activities (
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
-- 4. TRIGGER: dijalankan SETIAP KALI ada akun auth baru dibuat
--    (baik lewat Google OAuth maupun daftar manual email/password)
--
--    Logikanya:
--    - Kalau daftar via GOOGLE dan emailnya BUKAN admin -> DITOLAK
--      (transaksi dibatalkan, akun tidak pernah tercipta di Supabase Auth).
--    - Kalau daftar via GOOGLE dan emailnya admin -> profil dibuat,
--      is_admin = true, profile_completed = false (nanti dilengkapi
--      NIP/Tim Kerja/Jabatan lewat layar "Lengkapi Profil").
--    - Kalau daftar MANUAL (email/password) pakai email admin -> DITOLAK
--      (email itu direservasi khusus utk login Google admin).
--    - Kalau daftar MANUAL pakai email lain -> profil langsung dibuat
--      LENGKAP dari data yang dikirim form pendaftaran (nama, NIP, tim
--      kerja, jabatan dikirim sebagai user_metadata saat signUp()),
--      is_admin = false, profile_completed = true.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_is_admin_email boolean := (lower(new.email) = lower(public.admin_email()));
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if v_provider = 'google' then
    if not v_is_admin_email then
      raise exception 'SIMBAK_ONLY_ADMIN_GOOGLE: Login Google hanya diizinkan untuk akun admin.';
    end if;

    insert into public.profiles (user_id, email, full_name, avatar_url, is_admin, profile_completed)
    values (
      new.id,
      new.email,
      coalesce(v_meta->>'full_name', v_meta->>'name', new.email),
      v_meta->>'avatar_url',
      true,
      false
    )
    on conflict (user_id) do nothing;

  else
    -- daftar manual (email/password)
    if v_is_admin_email then
      raise exception 'SIMBAK_EMAIL_RESERVED_FOR_ADMIN: Email ini direservasi khusus untuk login Google admin.';
    end if;

    insert into public.profiles (
      user_id, email, full_name, nip, tim_kerja, jabatan, avatar_url,
      is_admin, profile_completed
    )
    values (
      new.id,
      new.email,
      coalesce(v_meta->>'full_name', new.email),
      v_meta->>'nip',
      v_meta->>'tim_kerja',
      v_meta->>'jabatan',
      null,
      false,
      true
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 5. TRIGGER PENGAMAN: cegah user biasa mengubah is_admin / user_id
--    miliknya sendiri lewat update profil (misal lewat "Edit Profil").
--    Hanya baris yang benar2 dieksekusi sbg admin (checked via RLS
--    context) yang boleh mengubah is_admin milik orang lain.
-- ------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger as $$
declare
  v_caller_is_admin boolean;
begin
  select is_admin into v_caller_is_admin
  from public.profiles
  where user_id = auth.uid();

  if coalesce(v_caller_is_admin, false) = false then
    -- bukan admin: paksa is_admin & user_id tetap sama seperti sebelumnya
    new.is_admin := old.is_admin;
    new.user_id := old.user_id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileges();

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.activities enable row level security;

-- Helper: cek apakah user yang sedang login adalah admin
create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where user_id = auth.uid()),
    false
  )
$$;

-- ===== PROFILES =====
-- Semua user login boleh LIHAT semua profil (dashboard & direktori
-- pegawai memang didesain transparan lintas tim).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Admin boleh menambahkan pegawai baru secara langsung (tanpa akun
-- login dulu -- user_id NULL, nanti pegawai itu daftar sendiri
-- terpisah kalau perlu login).
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert
  with check (public.is_current_user_admin());

-- User boleh update profil miliknya sendiri (nama, foto, dll -- kolom
-- is_admin & user_id sudah dikunci oleh trigger di atas). Admin boleh
-- update profil siapapun (mis. melengkapi data pegawai yang didaftarkan
-- manual olehnya).
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = user_id or public.is_current_user_admin())
  with check (auth.uid() = user_id or public.is_current_user_admin());

-- ===== ACTIVITIES =====
-- Semua user login boleh LIHAT semua kegiatan (transparansi beban kerja).
drop policy if exists "activities_select_authenticated" on public.activities;
create policy "activities_select_authenticated"
  on public.activities for select
  using (auth.role() = 'authenticated');

-- Hanya ADMIN yang boleh membuat kegiatan ABK baru & menugaskannya.
drop policy if exists "activities_insert_admin" on public.activities;
create policy "activities_insert_admin"
  on public.activities for insert
  with check (public.is_current_user_admin());

-- Admin boleh update kegiatan siapapun. Pegawai HANYA boleh update
-- kegiatan yang assignee_id-nya adalah dirinya sendiri (mis. update
-- persentase progress).
drop policy if exists "activities_update_admin_or_owner" on public.activities;
create policy "activities_update_admin_or_owner"
  on public.activities for update
  using (
    public.is_current_user_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = activities.assignee_id and p.user_id = auth.uid()
    )
  )
  with check (
    public.is_current_user_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = activities.assignee_id and p.user_id = auth.uid()
    )
  );

-- Hanya ADMIN yang boleh menghapus kegiatan.
drop policy if exists "activities_delete_admin" on public.activities;
create policy "activities_delete_admin"
  on public.activities for delete
  using (public.is_current_user_admin());

-- ============================================================
-- SELESAI. Tabel profiles & activities sengaja KOSONG (tanpa seed).
-- Langkah selanjutnya:
-- 1. Ganti email di public.admin_email() di atas, lalu jalankan ulang
--    HANYA bagian "create or replace function public.admin_email()"
--    kalau suatu saat perlu ganti admin.
-- 2. Login pertama kali lewat tombol "Lanjutkan dengan Google" pakai
--    email admin itu -> otomatis is_admin = true.
-- 3. Pegawai lain daftar lewat form "Daftar Akun Baru" (email asli +
--    password) -> otomatis is_admin = false, langsung lengkap.
-- 4. Admin juga bisa menambahkan pegawai langsung dari menu
--    "Direktori Pegawai > + Tambah Pegawai" (tanpa akun login dulu).
-- ============================================================
