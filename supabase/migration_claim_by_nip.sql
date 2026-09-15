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
