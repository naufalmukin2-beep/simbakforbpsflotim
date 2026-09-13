import { supabase } from './supabaseClient.js'

export const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'

// ---------- Mapping helpers (DB snake_case -> UI camelCase) ----------
function mapProfile(p) {
  return {
    id: p.id,
    userId: p.user_id,
    nip: p.nip || '-',
    name: p.full_name || 'Tanpa Nama',
    division: p.tim_kerja || '-',
    role: p.jabatan || '-',
    photo: p.avatar_url || DEFAULT_PHOTO,
    isAdmin: !!p.is_admin,
    profileCompleted: !!p.profile_completed,
    email: p.email
  }
}

function mapActivity(a) {
  return {
    id: a.id,
    name: a.name,
    empId: a.assignee_id,
    normVal: Number(a.norma_waktu),
    normUnit: a.norma_unit,
    volume: Number(a.volume),
    startDate: a.start_date ? a.start_date.substring(0, 16) : '',
    endDate: a.end_date ? a.end_date.substring(0, 16) : '',
    progress: a.progress
  }
}

// ---------- PROFILES ----------
export async function fetchEmployees() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('profile_completed', true)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[SIMBAK] Gagal fetch employees:', error.message)
    return []
  }
  return data.map(mapProfile)
}

export async function fetchProfileByUserId(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[SIMBAK] Gagal fetch profile:', error.message)
    return null
  }
  return data ? mapProfile(data) : null
}

// data.js (Ganti fungsi completeProfile dengan kode ini)
export async function completeProfile(userId, { fullName, nip, timKerja, jabatan, avatarUrl }) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      user_id: userId,
      full_name: fullName,
      nip: nip,
      tim_kerja: timKerja,
      jabatan: jabatan,
      avatar_url: avatarUrl,
      profile_completed: true
    }, { onConflict: 'user_id' })
    .select()
    .maybeSingle()

  if (error) throw error
  return data ? mapProfile(data) : null
}

// Dipakai Admin untuk menambahkan pegawai langsung dari menu Direktori
// Pegawai, TANPA akun login (user_id kosong). Kalau pegawai itu nanti
// daftar sendiri, dia akan dapat baris profil baru yang terpisah --
// admin tinggal hapus salah satu manual kalau terjadi duplikat.
export async function adminCreateEmployee({ fullName, nip, timKerja, jabatan }) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      full_name: fullName,
      nip,
      tim_kerja: timKerja,
      jabatan,
      is_admin: false,
      profile_completed: true
    })
    .select()
    .single()

  if (error) throw error
  return mapProfile(data)
}

export async function updateOwnProfile(userId, { fullName, nip, avatarUrl }) {
  const payload = { full_name: fullName, nip }
  if (avatarUrl) payload.avatar_url = avatarUrl

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('user_id', userId)
    .select()
    .maybeSingle()

  if (error) throw error
  return data ? mapProfile(data) : null
}

// ---------- ACTIVITIES ----------
export async function fetchActivities() {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[SIMBAK] Gagal fetch activities:', error.message)
    return []
  }
  return data.map(mapActivity)
}

export async function insertActivity(payload) {
  const { data, error } = await supabase
    .from('activities')
    .insert({
      name: payload.name,
      assignee_id: payload.empId,
      norma_waktu: payload.normVal,
      norma_unit: payload.normUnit,
      volume: payload.volume,
      start_date: payload.startDate || null,
      end_date: payload.endDate || null,
      progress: payload.progress
    })
    .select()
    .single()

  if (error) throw error
  return mapActivity(data)
}

export async function updateActivity(id, payload) {
  const { data, error } = await supabase
    .from('activities')
    .update({
      name: payload.name,
      assignee_id: payload.empId,
      norma_waktu: payload.normVal,
      norma_unit: payload.normUnit,
      volume: payload.volume,
      start_date: payload.startDate || null,
      end_date: payload.endDate || null,
      progress: payload.progress
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return mapActivity(data)
}

export async function deleteActivity(id) {
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) throw error
}
