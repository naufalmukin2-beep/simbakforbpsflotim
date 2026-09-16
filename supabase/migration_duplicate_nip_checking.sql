-- MIGRASI: Deteksi NIP duplikat.
-- - Admin "+ Tambah Pegawai": dicek langsung di kode (data.js), tidak
--   butuh perubahan database untuk itu (admin sudah authenticated,
--   RLS profiles_select_authenticated sudah mengizinkan baca semua).
-- - Form "Daftar Akun Baru" (belum login): butuh fungsi SECURITY DEFINER
--   ini karena anon belum boleh baca tabel profiles langsung.
-- AMAN dijalankan -- TIDAK menghapus data yang sudah ada.
-- Menggantikan fungsi lookup_unclaimed_employee_by_nip lama.
-- ============================================================
drop function if exists public.lookup_unclaimed_employee_by_nip(text);
 
create or replace function public.check_nip_registration_status(p_nip text)
returns table (
  exists_row boolean,
  is_claimed boolean,
  full_name text,
  tim_kerja text,
  jabatan text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (count(*) > 0) as exists_row,
    coalesce(bool_or(user_id is not null), false) as is_claimed,
    max(full_name) as full_name,
    max(tim_kerja) as tim_kerja,
    max(jabatan) as jabatan
  from public.profiles
  where nip is not null and trim(nip) = trim(p_nip)
$$;
 
grant execute on function public.check_nip_registration_status(text) to anon, authenticated;