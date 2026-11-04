-- ============================================================
-- MIGRASI: Klaim otomatis akun pegawai berdasarkan NIP
-- AMAN dijalankan kapan saja -- TIDAK menghapus data yang sudah ada.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_is_admin_email boolean := (lower(new.email) = lower(public.admin_email()));
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

    -- Coba klaim baris pegawai yang SUDAH ditambahkan Admin lewat
    -- "+ Tambah Pegawai" (NIP sama, belum pernah ada login/user_id kosong).
    update public.profiles
    set user_id = new.id,
        email = new.email,
        profile_completed = true
    where user_id is null
      and nip is not null
      and trim(nip) = trim(v_meta->>'nip')
    returning id into v_claimed_id;

    if v_claimed_id is null then
      -- Tidak ada baris yang cocok -> pegawai daftar sendiri dari nol.
      insert into public.profiles (
        user_id, email, full_name, nip, tim_kerja, jabatan, avatar_url,
        is_admin, profile_completed
      )
      values (
        new.id, new.email,
        coalesce(v_meta->>'full_name', new.email),
        v_meta->>'nip', v_meta->>'tim_kerja', v_meta->>'jabatan',
        null, false, true
      )
      on conflict (user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

-- ============================================================
-- MIGRASI: Klaim NIP untuk pegawai yang login lewat GOOGLE
-- (di layar "Lengkapi Profil"). Kalau NIP yang diketik sudah
-- ditambahkan Admin lewat "+ Tambah Pegawai" (belum ada login),
-- akun Google ini disambungkan ke baris itu -- bukan bikin duplikat.
-- AMAN dijalankan -- TIDAK menghapus data yang sudah ada.
-- ============================================================

-- 1. Trigger pengaman: tambah "pintu khusus" supaya fungsi klaim di
--    bawah boleh memindahkan user_id. Client tidak bisa memakainya.
create or replace function public.protect_profile_privileges()
returns trigger as $$
declare
  v_caller_is_admin boolean;
begin
  if coalesce(current_setting('simbak.bypass_protect', true), '') = 'on' then
    return new;
  end if;

  select is_admin into v_caller_is_admin
  from public.profiles
  where user_id = auth.uid();

  if coalesce(v_caller_is_admin, false) = false then
    new.is_admin := old.is_admin;
    new.user_id := old.user_id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

-- 2. Fungsi klaim (hanya untuk user yang sudah login & profilnya belum lengkap)
create or replace function public.claim_profile_by_nip(p_nip text)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profiles;
  v_target_id uuid;
  v_email text;
  v_result public.profiles;
begin
  if v_uid is null then
    raise exception 'SIMBAK_NOT_AUTHENTICATED: harus login dulu.';
  end if;

  select * into v_me from public.profiles where user_id = v_uid;
  if v_me.id is not null and v_me.profile_completed then
    raise exception 'SIMBAK_ALREADY_COMPLETED: profil kamu sudah lengkap.';
  end if;

  select id into v_target_id
  from public.profiles
  where user_id is null
    and nip is not null
    and trim(nip) = trim(p_nip)
  order by created_at
  limit 1
  for update;

  if v_target_id is null then
    return null;  -- tidak ada yang cocok, client lanjut simpan profil biasa
  end if;

  select email into v_email from auth.users where id = v_uid;

  perform set_config('simbak.bypass_protect', 'on', true);

  -- buang baris kosong yang dibuat otomatis saat login Google pertama
  delete from public.profiles where user_id = v_uid;

  -- sambungkan akun ini ke baris yang ditambahkan Admin (data Admin tetap jadi acuan)
  update public.profiles
  set user_id = v_uid,
      email = coalesce(v_email, email),
      avatar_url = coalesce(v_me.avatar_url, avatar_url),
      is_admin = coalesce(v_me.is_admin, false),
      profile_completed = true
  where id = v_target_id
  returning * into v_result;

  perform set_config('simbak.bypass_protect', 'off', true);

  return v_result;
end;
$$;

revoke all on function public.claim_profile_by_nip(text) from public, anon;
grant execute on function public.claim_profile_by_nip(text) to authenticated;