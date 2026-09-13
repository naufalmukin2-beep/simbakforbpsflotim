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
