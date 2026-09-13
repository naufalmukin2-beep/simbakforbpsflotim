# SIMBAK — Sistem Informasi Manajemen Beban Kerja

BPS Kabupaten Flores Timur • Satker 5309

Stack: **Vite + Vanilla JS + Tailwind (CDN) + Chart.js (CDN) + Supabase (Auth & Postgres)**.

---

## 0. Ringkasan arsitektur

- Auth: **Google OAuth** via Supabase Auth. Setelah login Google pertama kali,
  user diarahkan ke layar **"Lengkapi Profil"** (isi NIP, Tim Kerja, Jabatan)
  sebelum masuk dashboard.
- DB: Postgres (Supabase) — tabel `profiles` (data pegawai) & `activities`
  (kegiatan ABK).
- Ada juga tombol **"Demo Offline"** di layar login (preset Admin/Petrus L.)
  yang jalan 100% tanpa Supabase — pakai data dummy di memori. Ini jaring
  pengaman kalau pas demo internet/OAuth bermasalah.

---

## 1. Setup Supabase (sekali saja)

1. Buat project baru di https://supabase.com/dashboard (gratis).
2. Buka **SQL Editor** → New Query → tempel isi `supabase/schema.sql` → **Run**.
3. (Opsional tapi disarankan untuk demo) New Query lagi → tempel isi
   `supabase/seed.sql` → **Run**. Ini isi 8 pegawai + 9 kegiatan dummy sesuai
   mockup, jadi dashboard langsung penuh tanpa perlu 8 akun Google beneran.
4. Buka **Project Settings > API** → salin `Project URL` dan `anon public key`.
5. Di root project, copy `.env.example` jadi `.env`, lalu isi:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=isi-anon-key-kamu
   ```

## 2. Aktifkan Google OAuth

Ini bagian yang kemarin bikin "ribet" — pastikan ikuti urutan ini persis:

1. **Google Cloud Console** (https://console.cloud.google.com/):
   - Buat/pilih project → **APIs & Services > Credentials** → **Create
     Credentials > OAuth client ID** → Application type: **Web application**.
   - Di **Authorized redirect URIs**, tambahkan URL callback Supabase kamu:
     ```
     https://<project-ref>.supabase.co/auth/v1/callback
     ```
     (Ganti `<project-ref>` sesuai project kamu — bisa dilihat di URL Supabase.)
   - Salin **Client ID** dan **Client Secret** yang muncul.
2. **Supabase Dashboard** → **Authentication > Providers > Google**:
   - Aktifkan toggle, tempel Client ID & Client Secret dari langkah 1 → Save.
3. **Supabase Dashboard** → **Authentication > URL Configuration**:
   - **Site URL**: `http://localhost:5173` (buat development).
   - **Redirect URLs**: tambahkan juga `http://localhost:5173`
     (dan nanti tambahkan domain production kalau sudah deploy, mis. Vercel/Netlify).

   > Ini penyebab paling umum "putih polos" setelah login: kalau Site URL /
   > Redirect URLs tidak cocok dengan URL tempat app kamu jalan, Supabase
   > tetap redirect balik tapi sesi gagal terbaca dengan bersih.

## 3. Jalankan project

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Login pakai **"Lanjutkan dengan Google"**.
Setelah itu:

1. Kamu akan diarahkan ke layar **Lengkapi Profil** → isi NIP, Tim Kerja,
   Jabatan → Simpan.
2. Supaya akun kamu jadi **Admin/Kasubag** (bukan staff biasa), buka lagi
   **SQL Editor** di Supabase dan jalankan (ganti email kamu):
   ```sql
   update public.profiles set is_admin = true where email = 'emailkamu@gmail.com';
   ```
   Lalu refresh halaman.

## 4. Push ke Git

```bash
git init
git add .
git commit -m "Initial commit: SIMBAK dengan Supabase + Google OAuth"
git branch -M main
git remote add origin <URL_REPO_KAMU>
git push -u origin main
```

`.env` sudah masuk `.gitignore` — **jangan** commit file itu. Kalau deploy ke
Vercel/Netlify, isi environment variable yang sama (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) di dashboard hosting-nya, dan tambahkan domain
production ke **Redirect URLs** Supabase (langkah 2.3).

## 5. Struktur folder

```
simbak/
├── index.html              # markup + Tailwind (CDN) + Chart.js (CDN)
├── src/
│   ├── main.js              # semua logic UI, auth flow, rendering
│   ├── auth.js               # signInWithGoogle, signOut, getSession
│   ├── supabaseClient.js     # inisialisasi client
│   └── data.js                # fetch/insert/update/delete profiles & activities
├── supabase/
│   ├── schema.sql             # tabel + trigger + RLS
│   └── seed.sql                # data dummy 8 pegawai untuk demo
├── .env.example
└── package.json
```

## 6. Roadmap lanjutan (setelah demo)

Sesuai rencana awal — belum dikerjakan, catatan saja:

- Notifikasi H-2 deadline (browser/email) + integrasi WhatsApp Bot.
- Export laporan PDF/Excel (saat ini baru CSV).
- RLS yang lebih ketat: staff hanya bisa ubah kegiatan miliknya sendiri,
  admin full access (contoh policy sudah ada dikomentari di akhir
  `schema.sql`).
- Simpan foto profil ke **Supabase Storage** (saat ini disimpan sebagai
  base64 langsung di kolom `avatar_url` — cukup untuk demo, tapi tidak ideal
  untuk produksi/foto besar).
