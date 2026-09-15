-- ============================================================
-- MIGRASI: Ganti dari "1 email admin" jadi TABEL daftar admin
-- (bisa lebih dari 1 email, semua bisa login pakai Google).
-- AMAN dijalankan -- TIDAK menghapus data profiles/activities kamu.
--
-- >>> GANTI 2 baris placeholder di bawah dengan email Google asli
--     2 pegawai yang mau dijadikan admin <<<
-- ============================================================

-- 1. Tabel daftar admin
create table if not exists public.admin_emails (
  email text primary key
);
alter table public.admin_emails enable row level security;
-- Sengaja TIDAK dikasih policy apapun -- artinya tabel ini TERTUTUP
-- total dari akses langsung client (anon/authenticated). Cuma bisa
-- dibaca lewat fungsi is_configured_admin() di bawah (security definer).

-- 2. Isi daftar admin -- GANTI 2 baris placeholder ini!
insert into public.admin_emails (email) values
  ('naufalmukin2@gmail.com'),
  ('GANTI_EMAIL_PEGAWAI_1@gmail.com'),
  ('GANTI_EMAIL_PEGAWAI_2@gmail.com')
on conflict (email) do nothing;

-- 3. Fungsi pengecekan (dipakai trigger di bawah)
create or replace function public.is_configured_admin(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails where lower(email) = lower(p_email)
  )
$$;

-- 4. Update trigger utama biar pakai daftar admin yang baru
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_is_admin_email boolean := public.is_configured_admin(new.email);
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_claimed_id uuid;
begin
  if v_provider = 'google' then
    if not v_is_admin_email then
      raise exception 'SIMBAK_ONLY_ADMIN_GOOGLE: Login Google hanya diizinkan untuk akun admin.';
    end if;

    insert into public.profiles (user_id, email, full_name, avatar_url, is_admin, profile_completed)
    values (
      new.id, new.email,
      coalesce(v_meta->>'full_name', v_meta->>'name', new.email),
      v_meta->>'avatar_url', true, false
    )
    on conflict (user_id) do nothing;

  else
    if v_is_admin_email then
      raise exception 'SIMBAK_EMAIL_RESERVED_FOR_ADMIN: Email ini direservasi khusus untuk login Google admin.';
    end if;

    update public.profiles
    set user_id = new.id, email = new.email, profile_completed = true
    where user_id is null
      and nip is not null
      and trim(nip) = trim(v_meta->>'nip')
    returning id into v_claimed_id;

    if v_claimed_id is null then
      insert into public.profiles (
        user_id, email, full_name, nip, tim_kerja, jabatan, avatar_url,
        is_admin, profile_completed
      )
      values (
        new.id, new.email, coalesce(v_meta->>'full_name', new.email),
        v_meta->>'nip', v_meta->>'tim_kerja', v_meta->>'jabatan',
        null, false, true
      )
      on conflict (user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

-- 5. Perbaiki baris kamu yang KADUNG kebentuk dengan is_admin=false
--    (dibuat waktu admin_email masih placeholder lama).
update public.profiles set is_admin = true where lower(email) = lower('naufalmukin2@gmail.com');

-- 6. Beres-beres: fungsi lama single-email sudah tidak dipakai
drop function if exists public.admin_email();