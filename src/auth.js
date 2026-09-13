import { supabase } from './supabaseClient.js'

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Kembali ke halaman yang sama (root project) setelah login Google.
      // Pastikan URL ini terdaftar di Supabase Dashboard > Authentication >
      // URL Configuration > Redirect URLs. Lihat README.md untuk detail.
      redirectTo: window.location.origin
    }
  })
  if (error) {
    console.error('[SIMBAK] signInWithGoogle error:', error.message)
    alert('Gagal memulai login Google: ' + error.message)
  }
}

// Dipanggil sekali saat halaman dimuat, untuk menangkap kasus login Google
// yang DITOLAK oleh database (mis. bukan email admin). Supabase akan
// redirect balik ke app dengan parameter error di URL, bukan melempar
// exception JS biasa -- jadi ini dicek manual dari URL.
export function readOAuthErrorFromUrl() {
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : ''
  const search = window.location.search?.startsWith('?') ? window.location.search.slice(1) : ''
  const params = new URLSearchParams(hash || search)
  const errorDescription = params.get('error_description') || params.get('error')
  if (!errorDescription) return null

  // Bersihkan URL supaya error tidak terus muncul kalau user refresh.
  window.history.replaceState({}, document.title, window.location.pathname)

  const decoded = decodeURIComponent(errorDescription)
  if (decoded.includes('SIMBAK_ONLY_ADMIN_GOOGLE')) {
    return 'Login Google hanya diizinkan untuk akun admin. Kalau kamu pegawai, silakan daftar lewat tab "Daftar Akun Baru".'
  }
  if (decoded.includes('SIMBAK_EMAIL_RESERVED_FOR_ADMIN')) {
    return 'Email tersebut direservasi khusus untuk admin. Gunakan email lain untuk mendaftar.'
  }
  return decoded
}

// ---------------------------------------------------------------
// LOGIN / DAFTAR MANUAL (email asli + password) -- untuk pegawai.
// Semua tersimpan sungguhan di Supabase Auth + tabel profiles, TIDAK
// ada mode offline/lokal.
// ---------------------------------------------------------------
export async function signUpManual({ email, password, fullName, nip, timKerja, jabatan }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        nip,
        tim_kerja: timKerja,
        jabatan
      }
    }
  })
  if (error) throw error
  return data
}

export async function signInManual({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  try {
    await supabase.auth.signOut()
  } catch (err) {
    console.error('[SIMBAK] signOut error:', err)
  } finally {
    window.location.reload()
  }
}

export async function getSessionSafely() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('[SIMBAK] getSession error:', error.message)
      return null
    }
    return data.session
  } catch (err) {
    console.error('[SIMBAK] getSession threw:', err)
    return null
  }
}
