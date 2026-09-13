# SIMBAK — Sistem Informasi Manajemen Beban Kerja

BPS Kabupaten Flores Timur • Satker 5309

Stack: **Vite + Vanilla JS + Tailwind (CDN) + Chart.js (CDN) + Supabase (Auth & Postgres)**.

---

## 0. Ringkasan arsitektur (v2)

- **Login Admin**: HANYA lewat "Lanjutkan dengan Google", dan HANYA untuk 1
  email yang kamu tentukan di `supabase/schema.sql` (fungsi `admin_email()`).
  Login Google dari email lain akan **ditolak oleh database** (bukan cuma
  disembunyikan di UI).
- **Login Pegawai**: daftar manual (email asli + password) lewat tab
  "Daftar Akun Baru". Bisa juga ditambahkan langsung oleh Admin dari menu
  **Direktori Pegawai → + Tambah Pegawai** (tanpa akun login dulu; pegawai
  itu bisa daftar sendiri belakangan kalau perlu login).
- **Tidak ada mode offline/demo/dummy.** Semua read/write lewat Supabase
  (database asli), sinkron real-time antara Admin dan semua pegawai.
- **Hak akses (RLS)**:
  - Semua user login boleh **lihat** semua data (transparansi beban kerja
    antar tim, sesuai desain awal).
  - Hanya **Admin** yang boleh membuat/menghapus kegiatan ABK dan menugaskan
    ke pegawai.
  - **Pegawai** hanya boleh mengubah **progress** kegiatan miliknya sendiri
    (field lain terkunci di form, dan juga dijaga lewat RLS di database).
  - Hanya user itu sendiri (atau Admin) yang boleh mengubah profilnya
    sendiri; field `is_admin` dikunci lewat trigger database.
- Tabel `profiles` & `activities` sengaja **kosong** setelah setup — tidak
  ada data dummy. Admin mengisi dari UI.

---

## 1. Setup Supabase (sekali saja)

1. Buat project baru di https://supabase.com/dashboard (gratis).
2. **Sebelum** menjalankan schema: buka `supabase/schema.sql`, cari baris
   ```sql
   select 'GANTI_DENGAN_EMAIL_GOOGLE_ADMIN@gmail.com'
   ```
   dan ganti dengan **email Google asli kamu** (yang akan jadi Admin/Kasubag).
3. Buka **SQL Editor** → New Query → tempel seluruh isi `supabase/schema.sql`
   (yang sudah diedit) → **Run**.
   > File ini otomatis menghapus tabel lama kalau ada (reset bersih), lalu
   > membuat ulang tabel `profiles` & `activities` dalam keadaan kosong.
4. Buka **Project Settings > API** → salin `Project URL` dan `anon public key`.
5. Di root project, copy `.env.example` jadi `.env`, lalu isi:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=isi-anon-key-kamu
   ```
6. **Authentication > Providers > Email** → pastikan **"Confirm email"
   dimatikan** untuk demo (supaya pegawai yang daftar manual langsung bisa
   login tanpa perlu klik link konfirmasi di inbox). Aktifkan lagi kalau
   sudah production dan email beneran terpakai.

## 2. Aktifkan Google OAuth (khusus login Admin)

1. **Google Cloud Console** (https://console.cloud.google.com/):
   - Buat/pilih project → **APIs & Services > Credentials** → **Create
     Credentials > OAuth client ID** → Application type: **Web application**.
   - Di **Authorized redirect URIs**, tambahkan URL callback Supabase kamu:
     ```
     https://<project-ref>.supabase.co/auth/v1/callback
     ```
   - Salin **Client ID** dan **Client Secret** yang muncul.
2. **Supabase Dashboard** → **Authentication > Providers > Google**:
   - Aktifkan toggle, tempel Client ID & Client Secret dari langkah 1 → Save.
3. **Supabase Dashboard** → **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:5173` (untuk development).
   - **Redirect URLs**: tambahkan juga `http://localhost:5173` (dan nanti
     domain production kalau sudah deploy).

   > Kalau Site URL / Redirect URLs tidak cocok dengan URL tempat app kamu
   > jalan, Supabase tetap redirect balik tapi sesinya gagal terbaca bersih.

## 3. Jalankan project

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`.

- **Sebagai Admin**: klik "Lanjutkan dengan Google", login pakai email yang
  kamu daftarkan di langkah 1.2. Kamu akan diarahkan ke layar **Lengkapi
  Profil** → isi NIP, Tim Kerja, Jabatan → langsung masuk sebagai Admin
  (tidak perlu lagi jalankan SQL manual untuk set `is_admin`).
- **Sebagai Pegawai**: buka tab "Daftar Akun Baru", isi Nama, NIP, Tim
  Kerja, Jabatan, Email, Password → langsung masuk ke dashboard.
- Kalau ada yang mencoba login Google selain email admin, sistem akan
  menolak dan menampilkan pesan supaya daftar manual saja.

## 4. Push ke Git

```bash
git init
git add .
git commit -m "SIMBAK v2: admin-only Google OAuth + pendaftaran pegawai manual + RLS"
git branch -M main
git remote add origin <URL_REPO_KAMU>
git push -u origin main
```

`.env` sudah masuk `.gitignore` — **jangan** commit file itu. Isi
`.env.example` (anon key publik, aman karena dilindungi RLS) boleh ikut ter-commit.
Kalau deploy ke Vercel/Netlify, isi environment variable yang sama di
dashboard hosting-nya, dan tambahkan domain production ke **Redirect URLs**
Supabase (langkah 2.3).

## 5. Struktur folder

```
simbak/
├── index.html              # markup + Tailwind (CDN) + Chart.js (CDN)
├── src/
│   ├── main.js              # semua logic UI, auth flow, rendering, admin-gating
│   ├── auth.js               # signInWithGoogle, signUpManual, signInManual, signOut
│   ├── supabaseClient.js     # inisialisasi client
│   └── data.js                # fetch/insert/update/delete profiles & activities
├── supabase/
│   └── schema.sql             # tabel + trigger admin-lock + RLS (reset bersih, tanpa seed)
├── .env.example
└── package.json
```

## 6. Kalau perlu ganti admin

Buka SQL Editor Supabase, jalankan ulang HANYA bagian ini (ganti email):

```sql
create or replace function public.admin_email()
returns text language sql immutable as $$
  select 'email-admin-baru@gmail.com'
$$;
```

Email admin lama otomatis kehilangan hak `is_admin` kalau kamu juga jalankan:
```sql
update public.profiles set is_admin = false where email <> 'email-admin-baru@gmail.com' and is_admin = true;
```

## 7. Roadmap lanjutan (setelah demo)

- Notifikasi H-2 deadline (browser/email) + integrasi WhatsApp Bot.
- Export laporan PDF/Excel (saat ini baru CSV).
- Merge otomatis kalau pegawai yang sudah ditambahkan manual oleh Admin
  ternyata juga mendaftar sendiri (saat ini akan jadi 2 baris profil
  terpisah — Admin perlu hapus salah satu secara manual).
- Single Sign-On (SSO) resmi instansi, sesuai roadmap Tahap 3 awal.
