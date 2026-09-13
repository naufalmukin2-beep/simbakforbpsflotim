-- ============================================================
-- SIMBAK - SEED DATA (opsional, untuk demo)
-- Jalankan SETELAH schema.sql. Isi ini data dummy 8 pegawai + 9 kegiatan
-- ABK sesuai contoh yang sudah kamu desain, biar dashboard langsung
-- keliatan penuh & realistis saat demo besok.
-- ============================================================

insert into public.profiles (id, full_name, nip, tim_kerja, jabatan, avatar_url, profile_completed)
values
  ('11111111-1111-1111-1111-111111111101', 'Petrus L. Tukan, S.E.', '198803122010121001', 'Subbagian Umum', 'Pengelola SPM & DIPA Satker', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111102', 'Maria Goreti Fernandez, S.ST', '199205142014022002', 'Tim IPDS', 'Pranata Komputer Ahli Muda', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111103', 'Yoseph Kraeng, S.Si', '198511202008011003', 'Tim Statistik Sosial', 'Statisi Ahli Muda', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111104', 'Emanuel Hurint, S.Stat', '199408092016021004', 'Tim Statistik Produksi', 'Statisi Penyelia', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111105', 'Siti Aminah, S.Tr.Stat', '199602012019012005', 'Tim Statistik Produksi', 'Statisi Ahli Pertama', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111106', 'Fransiskus X. Lama, A.Md', '199004152012121006', 'Tim Statistik Distribusi', 'Penata Laksana Statistik', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111107', 'Theresia Maran, S.E.', '199109302015032007', 'Tim Nerwilis', 'Penata Laksana Keuangan', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', true),
  ('11111111-1111-1111-1111-111111111108', 'Yohanes B. Koten, A.Md', '198707182009021008', 'Tim Nerwilis', 'Pengelola BMN', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80', true)
on conflict (id) do nothing;

insert into public.activities (name, assignee_id, norma_waktu, norma_unit, volume, start_date, end_date, progress)
values
  ('Pengelolaan SPM & DIPA Satker 5307', '11111111-1111-1111-1111-111111111101', 3.5, 'jam', 40, '2026-09-01T08:00', '2026-09-30T16:00', 85),
  ('Pemeliharaan Jaringan & Portal BPS', '11111111-1111-1111-1111-111111111102', 2.0, 'jam', 60, '2026-09-01T08:00', '2026-09-25T16:00', 90),
  ('Pencacahan Lapangan Susenas 2026', '11111111-1111-1111-1111-111111111103', 3.55, 'jam', 40, '2026-09-05T08:00', '2026-09-28T16:00', 60),
  ('Survei KSA Padi & Ubinan Tanaman', '11111111-1111-1111-1111-111111111104', 4.0, 'jam', 38, '2026-09-01T08:00', '2026-09-20T16:00', 100),
  ('Survei Pertanian & Hortikultura', '11111111-1111-1111-1111-111111111105', 2.5, 'jam', 46, '2026-09-10T08:00', '2026-09-30T16:00', 40),
  ('Survei Harga Konsumen Pasar Larantuka', '11111111-1111-1111-1111-111111111106', 2.5, 'jam', 50, '2026-09-01T08:00', '2026-09-28T16:00', 75),
  ('Penyusunan PDRB Kabupaten Flotim', '11111111-1111-1111-1111-111111111107', 4.0, 'jam', 23, '2026-09-12T08:00', '2026-09-29T16:00', 30),
  ('Analisis Neraca Wilayah & Laju Pertumbuhan', '11111111-1111-1111-1111-111111111108', 2.0, 'jam', 53.5, '2026-09-01T08:00', '2026-09-27T16:00', 70),
  ('Cetak Surat Tugas & Lembar Kendali', '11111111-1111-1111-1111-111111111101', 3.0, 'menit', 20, '2026-09-10T08:00', '2026-09-12T16:00', 100)
on conflict do nothing;
