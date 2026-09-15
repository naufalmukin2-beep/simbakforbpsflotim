-- ============================================================
-- MIGRASI: Fungsi buat auto-lengkap Nama/Tim/Jabatan di form
-- "Daftar Akun Baru" begitu pegawai ngetik NIP yang sudah
-- ditambahkan Admin lewat "+ Tambah Pegawai".
-- AMAN dijalankan -- TIDAK menghapus data yang sudah ada.
--
-- Cuma nge-return field yang aman dipublikasikan ke orang yang
-- BELUM login (nama, tim, jabatan) -- BUKAN seluruh tabel profiles.
-- Cuma cocok kalau baris itu belum pernah ada yang login (user_id
-- kosong), jadi tidak bisa dipakai buat "intip" data pegawai lain
-- yang sudah aktif.
-- ============================================================
create or replace function public.lookup_unclaimed_employee_by_nip(p_nip text)
returns table (full_name text, tim_kerja text, jabatan text)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name, p.tim_kerja, p.jabatan
  from public.profiles p
  where p.user_id is null
    and p.nip is not null
    and trim(p.nip) = trim(p_nip)
  limit 1
$$;

grant execute on function public.lookup_unclaimed_employee_by_nip(text) to anon, authenticated;
