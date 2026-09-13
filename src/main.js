import { supabase } from './supabaseClient.js'
import { signInWithGoogle, signUpWithEmail, signInWithEmail, signOut, getSessionSafely } from './auth.js'
import {
  fetchEmployees,
  fetchActivities,
  fetchProfileByUserId,
  completeProfile,
  updateOwnProfile,
  insertActivity,
  updateActivity,
  deleteActivity,
  DEFAULT_PHOTO
} from './data.js'

const STANDARD_EFF_HOURS = 125

// STATE
let currentUser = null
let employees = []
let activities = []
let isOfflineDemo = false
let tempNewPhotoUrl = null
let pendingSessionUser = null
let isRegisteringProcess = false

let chartDivisionInstance = null
let chartStatusInstance = null
let chartAnalyticsBarInstance = null
let chartAnalyticsRadarInstance = null

// Helper Penyimpanan Permanen Lokal (LocalStorage)
function getLocalRegisteredUsers() {
  try {
    return JSON.parse(localStorage.getItem('simbak_registered_users') || '[]')
  } catch (e) {
    return []
  }
}

function saveLocalRegisteredUser(userObj) {
  const users = getLocalRegisteredUsers()
  const existingIdx = users.findIndex(u => (u.nip && u.nip === userObj.nip) || (u.email && u.email === userObj.email))
  if (existingIdx !== -1) {
    users[existingIdx] = { ...users[existingIdx], ...userObj }
  } else {
    users.push({
      id: 'USER-' + Date.now(),
      ...userObj,
      photo: DEFAULT_PHOTO
    })
  }
  localStorage.setItem('simbak_registered_users', JSON.stringify(users))
}

// INIT / AUTH FLOW
async function init() {
  try {
    const session = await getSessionSafely()
    if (session) {
      await handleAuthedSession(session)
    } else {
      showAuthScreen()
    }
  } catch (err) {
    console.error('[SIMBAK] init() error:', err)
    showAuthScreen()
  }

  try {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await handleAuthedSession(session)
      }
      if (event === 'SIGNED_OUT') {
        showAuthScreen()
      }
    })
  } catch (err) {
    console.error('[SIMBAK] onAuthStateChange gagal dipasang:', err)
  }
}

async function handleAuthedSession(session) {
  if (isRegisteringProcess) return;

  try {
    isOfflineDemo = false
    const profile = await fetchProfileByUserId(session.user.id)

    if (!profile || !profile.profileCompleted) {
      pendingSessionUser = session.user
      showCompleteProfileScreen(session.user)
      return
    }

    currentUser = {
      id: profile.id,
      empId: profile.id,
      userId: profile.userId,
      isAdmin: profile.isAdmin,
      name: profile.name,
      role: profile.role
    }

    await loadAllDataFromSupabase()
    enterMainApp()
  } catch (err) {
    console.error('[SIMBAK] handleAuthedSession error:', err)
    showAuthScreen()
  }
}

async function loadAllDataFromSupabase() {
  const [emps, acts] = await Promise.all([fetchEmployees(), fetchActivities()])
  const localUsers = getLocalRegisteredUsers()

  const combinedEmps = [...emps]
  localUsers.forEach(lu => {
    if (!combinedEmps.some(e => e.nip === lu.nip || e.email === lu.email)) {
      combinedEmps.push({
        id: lu.id,
        userId: lu.id,
        nip: lu.nip || '-',
        name: lu.name,
        division: lu.division,
        role: lu.role,
        photo: lu.photo || DEFAULT_PHOTO,
        isAdmin: false,
        profileCompleted: true,
        email: lu.email
      })
    }
  })

  employees = combinedEmps
  activities = acts
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden')
  document.getElementById('complete-profile-screen').classList.add('hidden')
  document.getElementById('main-app').classList.add('hidden')
}

function showCompleteProfileScreen(googleUser) {
  document.getElementById('auth-screen').classList.add('hidden')
  document.getElementById('main-app').classList.add('hidden')
  document.getElementById('complete-profile-screen').classList.remove('hidden')

  const meta = googleUser.user_metadata || {}
  document.getElementById('cp-google-photo').src = meta.avatar_url || meta.picture || DEFAULT_PHOTO
  document.getElementById('cp-input-name').value = meta.full_name || meta.name || ''
}

async function handleGoogleSignIn() {
  await signInWithGoogle()
}

async function handleCompleteProfileSubmit(event) {
  event.preventDefault()
  const btn = document.getElementById('cp-submit-btn')
  const originalText = btn.innerText

  try {
    btn.disabled = true
    btn.innerText = 'Menyimpan...'

    const fullName = document.getElementById('cp-input-name').value.trim()
    const nip = document.getElementById('cp-input-nip').value.trim()
    const division = document.getElementById('cp-input-division').value
    const role = document.getElementById('cp-input-role').value.trim()

    if (!fullName || !nip || !role) {
      alert('Semua kolom wajib diisi!')
      return
    }

    if (!pendingSessionUser) {
      alert('Sesi login tidak terdeteksi. Silakan login ulang.')
      return
    }

    const meta = pendingSessionUser?.user_metadata || {}
    const profile = await completeProfile(pendingSessionUser.id, {
      fullName,
      nip,
      timKerja: division,
      jabatan: role,
      email: pendingSessionUser.email,
      avatarUrl: meta.avatar_url || meta.picture || DEFAULT_PHOTO
    })

    if (!profile) throw new Error('Data profil tidak berhasil disimpan di database.')

    currentUser = {
      id: profile.id,
      empId: profile.id,
      userId: profile.userId,
      isAdmin: profile.isAdmin,
      name: profile.name,
      role: profile.role
    }

    await loadAllDataFromSupabase()
    document.getElementById('complete-profile-screen').classList.add('hidden')
    enterMainApp()
    showToast('Profil berhasil dilengkapi. Selamat datang!')
  } catch (err) {
    console.error('[SIMBAK] handleCompleteProfileSubmit error:', err)
    alert('Gagal menyimpan profil: ' + (err.message || err))
  } finally {
    btn.disabled = false
    btn.innerText = originalText
  }
}

async function handleLoginSubmit() {
  const inputVal = document.getElementById('login-input-nip').value.trim()
  const password = document.getElementById('login-input-pass').value.trim()

  if (!inputVal || !password) {
    alert('Masukkan NIP / Email dan Password!')
    return
  }

  let emailToTry = inputVal
  if (!inputVal.includes('@')) {
    try {
      const { data } = await supabase.from('profiles').select('email').eq('nip', inputVal).maybeSingle()
      if (data && data.email) {
        emailToTry = data.email
      } else {
        emailToTry = `${inputVal}@simbak.bps`
      }
    } catch (e) {
      emailToTry = `${inputVal}@simbak.bps`
    }
  }

  try {
    const data = await signInWithEmail(emailToTry, password)
    if (data?.session) return
  } catch (err) {
    console.warn('[SIMBAK] Login Supabase gagal/fallback:', err.message)
  }

  const localUsers = getLocalRegisteredUsers()
  const matchedUser = localUsers.find(
    u => (u.nip === inputVal || u.email === inputVal || u.email === emailToTry) && u.password === password
  )

  if (matchedUser) {
    isOfflineDemo = true
    let emp = employees.find(e => e.nip === matchedUser.nip || e.email === matchedUser.email)
    if (!emp) {
      emp = {
        id: matchedUser.id,
        nip: matchedUser.nip,
        name: matchedUser.name,
        division: matchedUser.division,
        role: matchedUser.role,
        photo: matchedUser.photo || DEFAULT_PHOTO
      }
      employees.push(emp)
    }

    currentUser = {
      id: emp.id,
      empId: emp.id,
      isAdmin: false,
      name: matchedUser.name,
      role: matchedUser.division
    }

    enterMainApp()
    showToast(`Selamat datang kembali, ${matchedUser.name}!`)
    return
  }

  alert('NIP/Email atau Password salah! Pastikan Anda sudah mendaftar terlebih dahulu.')
}

async function handleRegisterSubmit() {
  const name = document.getElementById('reg-name').value.trim()
  const emailInput = document.getElementById('reg-email') ? document.getElementById('reg-email').value.trim() : ''
  const nip = document.getElementById('reg-nip').value.trim()
  const division = document.getElementById('reg-division').value
  const role = document.getElementById('reg-role').value.trim()
  const password = document.getElementById('reg-pass').value.trim()

  if (!name || !nip || !password || !role) {
    alert('Lengkapi seluruh form registrasi (Nama, NIP, Jabatan, Password)!')
    return
  }

  const btn = document.querySelector('#auth-form-register button')
  const originalText = btn.innerText

  try {
    btn.disabled = true
    btn.innerText = 'Menyimpan...'
    isRegisteringProcess = true

    const userEmail = emailInput || `${nip}@simbak.bps`

    try {
      const authData = await signUpWithEmail(userEmail, password, { full_name: name })
      if (authData?.user) {
        await completeProfile(authData.user.id, {
          fullName: name,
          nip,
          timKerja: division,
          jabatan: role,
          email: userEmail,
          avatarUrl: DEFAULT_PHOTO
        })
      }
    } catch (sbErr) {
      console.warn('[SIMBAK] Supabase register info:', sbErr.message)
    }

    saveLocalRegisteredUser({ name, email: userEmail, nip, division, role, password })

    showToast('Akun berhasil dibuat & tersimpan permanen!')

    toggleAuthTab('login')
    document.getElementById('login-input-nip').value = nip
    document.getElementById('login-input-pass').value = password
  } catch (err) {
    console.error('[SIMBAK] handleRegisterSubmit error:', err)
    alert('Gagal mendaftar: ' + err.message)
  } finally {
    isRegisteringProcess = false
    btn.disabled = false
    btn.innerText = originalText
  }
}

// UI HELPERS & RENDER
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebar-overlay')
  const isHidden = sidebar.classList.contains('-translate-x-full')
  if (isHidden) {
    sidebar.classList.remove('-translate-x-full')
    overlay.classList.remove('hidden')
  } else {
    sidebar.classList.add('-translate-x-full')
    overlay.classList.add('hidden')
  }
}

function getNormaHours(act) {
  return act.normUnit === 'menit' ? act.normVal / 60 : act.normVal
}

function getEmployeeTotalHours(empId) {
  return activities.filter(a => a.empId === empId).reduce((sum, a) => sum + (getNormaHours(a) * a.volume), 0)
}

function getEmployeeWorkloadPercent(empId) {
  const hours = getEmployeeTotalHours(empId)
  return parseFloat(((hours / STANDARD_EFF_HOURS) * 100).toFixed(1))
}

function getWorkloadStatus(percent) {
  if (percent > 100) return { label: 'Overload', badgeClass: 'bg-red-100 text-red-800 border-red-200', textClass: 'text-red-600', barClass: 'bg-red-500' }
  if (percent >= 50) return { label: 'Optimal', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', textClass: 'text-emerald-600', barClass: 'bg-emerald-500' }
  return { label: 'Underload', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', textClass: 'text-amber-600', barClass: 'bg-amber-500' }
}

function getActivityStatus(act) {
  if (act.progress >= 100) return { label: 'Selesai', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  if (!act.endDate) return { label: 'Sedang Berjalan', class: 'bg-blue-100 text-blue-800 border-blue-200' }
  
  const endDateObj = new Date(act.endDate)
  if (isNaN(endDateObj.getTime())) return { label: 'Sedang Berjalan', class: 'bg-blue-100 text-blue-800 border-blue-200' }

  const diffDays = Math.ceil((endDateObj - new Date()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: 'Terlambat', class: 'bg-red-100 text-red-800 border-red-200' }
  if (diffDays <= 2) return { label: `Hampir Deadline (${diffDays} hr)`, class: 'bg-amber-100 text-amber-800 border-amber-200' }
  return { label: `Sedang Berjalan (${diffDays} hr)`, class: 'bg-blue-100 text-blue-800 border-blue-200' }
}

function handleThemeToggle(isDark) {
  const html = document.documentElement
  const themeIcon = document.getElementById('theme-icon')
  const themeLabel = document.getElementById('theme-label-text')

  if (isDark) {
    html.classList.add('dark')
    if (themeIcon) themeIcon.className = 'fa-solid fa-moon text-bps-blue text-lg'
    if (themeLabel) themeLabel.innerText = 'Dark Mode'
    localStorage.setItem('theme', 'dark')
  } else {
    html.classList.remove('dark')
    if (themeIcon) themeIcon.className = 'fa-solid fa-sun text-amber-500 text-lg'
    if (themeLabel) themeLabel.innerText = 'Light Mode'
    localStorage.setItem('theme', 'light')
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  const isDark = savedTheme === 'dark'
  const toggleSwitch = document.getElementById('theme-toggle-switch')
  if (toggleSwitch) toggleSwitch.checked = isDark
  handleThemeToggle(isDark)
}

function openModalProfile() {
  if (!currentUser) return
  const emp = employees.find(e => e.id === currentUser.empId) || employees[0]

  document.getElementById('profile-input-name').value = currentUser.name
  document.getElementById('profile-input-nip').value = emp ? emp.nip : ''
  document.getElementById('profile-preview-img').src = emp && emp.photo ? emp.photo : DEFAULT_PHOTO
  tempNewPhotoUrl = null

  document.getElementById('modal-profile').classList.remove('hidden')
}

function closeModalProfile() {
  document.getElementById('modal-profile').classList.add('hidden')
}

function previewProfilePhoto(event) {
  const file = event.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = function (e) {
      tempNewPhotoUrl = e.target.result
      document.getElementById('profile-preview-img').src = tempNewPhotoUrl
    }
    reader.readAsDataURL(file)
  }
}

async function handleSaveProfile(event) {
  event.preventDefault()
  const newName = document.getElementById('profile-input-name').value.trim()
  const newNip = document.getElementById('profile-input-nip').value.trim()

  if (!newName || !newNip) {
    alert('Nama dan NIP tidak boleh kosong!')
    return
  }

  try {
    if (isOfflineDemo || !currentUser.userId) {
      currentUser.name = newName
      const empIndex = employees.findIndex(e => e.id === currentUser.empId)
      if (empIndex !== -1) {
        employees[empIndex].name = newName
        employees[empIndex].nip = newNip
        if (tempNewPhotoUrl) employees[empIndex].photo = tempNewPhotoUrl
      }
    } else {
      await updateOwnProfile(currentUser.userId, {
        fullName: newName,
        nip: newNip,
        avatarUrl: tempNewPhotoUrl || undefined
      })
      currentUser.name = newName
      await loadAllDataFromSupabase()
    }

    updateUserBadgeUI()
    refreshAllViews()
    closeModalProfile()
    showToast('Profil berhasil diperbarui!')
  } catch (err) {
    console.error('[SIMBAK] handleSaveProfile error:', err)
    showToast('Gagal menyimpan profil.')
  }
}

function updateUserBadgeUI() {
  if (!currentUser) return
  const emp = employees.find(e => e.id === currentUser.empId)

  document.getElementById('user-name-badge').innerText = currentUser.name

  const welcomeElem = document.getElementById('welcome-user-name')
  if (welcomeElem) welcomeElem.innerText = currentUser.name

  const avatarImg = document.getElementById('user-avatar-img')
  const avatarText = document.getElementById('user-avatar-text')

  if (emp && emp.photo) {
    avatarImg.src = emp.photo
    avatarImg.classList.remove('hidden')
    avatarText.classList.add('hidden')
  } else {
    avatarImg.classList.add('hidden')
    avatarText.classList.remove('hidden')
    avatarText.innerText = currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('')
  }
}

function toggleAuthTab(tab) {
  if (tab === 'login') {
    document.getElementById('auth-form-login').classList.remove('hidden')
    document.getElementById('auth-form-register').classList.add('hidden')
    document.getElementById('tab-btn-login').className = 'flex-1 py-2 rounded-lg bg-bps-blue text-white transition shadow'
    document.getElementById('tab-btn-register').className = 'flex-1 py-2 rounded-lg text-slate-300 hover:text-white transition'
  } else {
    document.getElementById('auth-form-login').classList.add('hidden')
    document.getElementById('auth-form-register').classList.remove('hidden')
    document.getElementById('tab-btn-register').className = 'flex-1 py-2 rounded-lg bg-bps-blue text-white transition shadow'
    document.getElementById('tab-btn-login').className = 'flex-1 py-2 rounded-lg text-slate-300 hover:text-white transition'
  }
}

function enterMainApp() {
  document.getElementById('auth-screen').classList.add('hidden')
  document.getElementById('complete-profile-screen').classList.add('hidden')
  document.getElementById('main-app').classList.remove('hidden')

  updateUserBadgeUI()
  initTheme()
  refreshAllViews()
}

async function handleLogout() {
  if (isOfflineDemo) {
    isOfflineDemo = false
    currentUser = null
    document.getElementById('main-app').classList.add('hidden')
    document.getElementById('auth-screen').classList.remove('hidden')
    return
  }
  await signOut()
}

function switchTab(tabName) {
  if (window.innerWidth < 768) {
    const sidebar = document.getElementById('sidebar')
    if (!sidebar.classList.contains('-translate-x-full')) toggleSidebar()
  }

  document.querySelectorAll('.tab-page').forEach(p => p.classList.add('hidden'))
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-bps-blue', 'text-white', 'shadow')
    btn.classList.add('text-slate-300', 'hover:bg-slate-800', 'hover:text-white')
  })

  const targetPage = document.getElementById(`tab-content-${tabName}`)
  if (targetPage) targetPage.classList.remove('hidden')

  const targetBtn = document.getElementById(`nav-${tabName}`)
  if (targetBtn) {
    targetBtn.classList.remove('text-slate-300', 'hover:bg-slate-800', 'hover:text-white')
    targetBtn.classList.add('bg-bps-blue', 'text-white', 'shadow')
  }

  if (tabName === 'dashboard' || tabName === 'analytics') {
    setTimeout(() => renderCharts(), 100)
  }
}

// RENDER & DASHBOARD
function renderDashboard() {
  const totalEmps = employees.length || 1
  let totalWorkloadSum = 0, overloadCount = 0, optimalCount = 0, underloadCount = 0

  const empDataList = employees.map(emp => {
    const hours = getEmployeeTotalHours(emp.id)
    const percent = parseFloat(((hours / STANDARD_EFF_HOURS) * 100).toFixed(1))
    const status = getWorkloadStatus(percent)
    const actCount = activities.filter(a => a.empId === emp.id).length

    totalWorkloadSum += percent
    if (percent > 100) overloadCount++
    else if (percent >= 50) optimalCount++
    else underloadCount++

    return { ...emp, hours, percent, status, actCount }
  })

  document.getElementById('kpi-total-employees').innerText = employees.length
  document.getElementById('kpi-avg-workload').innerText = `${(totalWorkloadSum / totalEmps).toFixed(1)}%`
  document.getElementById('kpi-overload-count').innerText = overloadCount
  document.getElementById('kpi-optimal-count').innerText = optimalCount
  document.getElementById('kpi-underload-count').innerText = underloadCount

  const sorted = [...empDataList].sort((a, b) => b.percent - a.percent)
  const tbody = document.getElementById('dashboard-priority-table-body')
  tbody.innerHTML = ''

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">Belum ada data pegawai. Silakan daftarkan pegawai lewat form registrasi.</td></tr>`
    return
  }

  sorted.forEach(emp => {
    const tr = document.createElement('tr')
    tr.className = 'hover:bg-slate-50 transition'
    tr.innerHTML = `
      <td class="py-3.5 px-4 sm:px-6 font-semibold text-slate-800">
        <div>${emp.name}</div>
        <div class="text-xs text-slate-400 font-normal">NIP: ${emp.nip}</div>
      </td>
      <td class="py-3.5 px-4 sm:px-6 text-slate-600">${emp.division}</td>
      <td class="py-3.5 px-4 sm:px-6 font-medium text-slate-700">${emp.actCount} Kegiatan</td>
      <td class="py-3.5 px-4 sm:px-6 font-bold text-slate-800">${emp.hours.toFixed(1)} Jam</td>
      <td class="py-3.5 px-4 sm:px-6 font-bold ${emp.status.textClass}">${emp.percent}%</td>
      <td class="py-3.5 px-4 sm:px-6">
        <span class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${emp.status.badgeClass}">
          ${emp.status.label}
        </span>
      </td>
    `
    tbody.appendChild(tr)
  })
}

function renderActivitiesTable() {
  const searchQuery = document.getElementById('search-activity')?.value.toLowerCase() || ''
  const filterDiv = document.getElementById('filter-activity-division')?.value
  const tbody = document.getElementById('activities-table-body')
  tbody.innerHTML = ''

  const filtered = activities.filter(act => {
    const emp = employees.find(e => e.id === act.empId)
    const matchesSearch = act.name.toLowerCase().includes(searchQuery) || (emp && emp.name.toLowerCase().includes(searchQuery))
    const matchesDiv = filterDiv === 'ALL' || (emp && emp.division === filterDiv)
    return matchesSearch && matchesDiv
  })

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">Tidak ada kegiatan yang ditemukan.</td></tr>`
    return
  }

  filtered.forEach(act => {
    const emp = employees.find(e => e.id === act.empId)
    const totalHours = (getNormaHours(act) * act.volume).toFixed(1)
    const status = getActivityStatus(act)
    const canManage = currentUser && (currentUser.isAdmin || currentUser.empId === act.empId)

    const tr = document.createElement('tr')
    tr.className = 'hover:bg-slate-50 transition'
    tr.innerHTML = `
      <td class="py-3.5 px-4 sm:px-6 font-semibold text-slate-800">${act.name}</td>
      <td class="py-3.5 px-4 sm:px-6 text-slate-700">
        <div class="font-bold">${emp ? emp.name : '-'}</div>
        <div class="text-[11px] text-slate-400">${emp ? emp.division : ''}</div>
      </td>
      <td class="py-3.5 px-4 sm:px-6 text-center font-medium">${act.normVal} ${act.normUnit}</td>
      <td class="py-3.5 px-4 sm:px-6 text-center font-medium">${act.volume} Target</td>
      <td class="py-3.5 px-4 sm:px-6 text-center font-bold text-bps-blue">${totalHours} h</td>
      <td class="py-3.5 px-4 sm:px-6">
        <span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold border ${status.class}">
          ${status.label}
        </span>
      </td>
      <td class="py-3.5 px-4 sm:px-6 text-center">
        ${canManage ? `
          <button onclick="openModalEditActivity('${act.id}')" title="Edit Kegiatan" class="p-1.5 text-slate-500 hover:text-bps-blue transition"><i class="fa-solid fa-pen-to-square"></i></button>
          <button onclick="handleDeleteActivity('${act.id}')" title="Hapus Kegiatan" class="p-1.5 text-slate-500 hover:text-red-600 transition"><i class="fa-solid fa-trash-can"></i></button>
        ` : `<span class="text-xs text-slate-300 italic">-</span>`}
      </td>
    `
    tbody.appendChild(tr)
  })
}

function renderEmployeeGrid() {
  const searchQuery = document.getElementById('search-employee')?.value.toLowerCase() || ''
  const statusFilter = document.getElementById('filter-employee-status')?.value
  const container = document.getElementById('employee-grid-container')
  container.innerHTML = ''

  const filtered = employees.filter(emp => {
    const percent = getEmployeeWorkloadPercent(emp.id)
    const status = getWorkloadStatus(percent).label.toUpperCase()
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery) || emp.role.toLowerCase().includes(searchQuery) || emp.division.toLowerCase().includes(searchQuery)
    const matchesStatus = statusFilter === 'ALL' || status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (filtered.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-8 text-slate-400 italic">Tidak ada pegawai yang ditemukan. Silakan tambahkan pegawai via form pendaftaran.</div>`
    return
  }

  filtered.forEach(emp => {
    const hours = getEmployeeTotalHours(emp.id)
    const percent = getEmployeeWorkloadPercent(emp.id)
    const status = getWorkloadStatus(percent)

    const card = document.createElement('div')
    card.onclick = () => openModalEmployeeDetail(emp.id)
    card.className = 'bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm cursor-pointer hover:shadow-md hover:border-bps-blue/40 transition'
    card.innerHTML = `
      <div class="flex items-center gap-3 mb-4">
        <img src="${emp.photo || DEFAULT_PHOTO}" class="w-12 h-12 rounded-full object-cover border-2 border-slate-100">
        <div class="overflow-hidden">
          <p class="font-bold text-sm text-slate-800 truncate">${emp.name}</p>
          <p class="text-xs text-slate-500 truncate">${emp.role}</p>
          <span class="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-bps-blue rounded-md">${emp.division}</span>
        </div>
      </div>
      <div class="space-y-1.5">
        <div class="flex justify-between items-center text-[11px]">
          <span class="text-slate-400">Jam Kerja Efektif:</span>
          <span class="font-bold text-slate-700">${hours.toFixed(1)} / ${STANDARD_EFF_HOURS} h</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div class="${status.barClass} h-2 rounded-full" style="width: ${Math.min(percent, 100)}%"></div>
        </div>
        <div class="flex justify-between items-center text-[11px]">
          <span class="text-slate-400">Persentase Beban:</span>
          <span class="font-extrabold ${status.textClass}">${percent}% (${status.label})</span>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-bps-blue font-bold">
        <span>Lihat Rincian Kegiatan ABK</span>
        <i class="fa-solid fa-chevron-right"></i>
      </div>
    `
    container.appendChild(card)
  })
}

function renderCharts() {
  const divisions = ["Subbagian Umum", "Tim Statistik Sosial", "Tim Statistik Produksi", "Tim Statistik Distribusi", "Tim Nerwilis", "Tim IPDS"]
  const divAvgData = divisions.map(div => {
    const divEmps = employees.filter(e => e.division === div)
    if (divEmps.length === 0) return 0
    return parseFloat((divEmps.reduce((sum, e) => sum + getEmployeeWorkloadPercent(e.id), 0) / divEmps.length).toFixed(1))
  })

  const ctxDiv = document.getElementById('chartWorkloadByDivision')
  if (ctxDiv) {
    if (chartDivisionInstance) chartDivisionInstance.destroy()
    chartDivisionInstance = new Chart(ctxDiv, {
      type: 'bar',
      data: {
        labels: divisions.map(d => d.replace('Tim ', '')),
        datasets: [{ data: divAvgData, backgroundColor: divAvgData.map(v => v > 100 ? '#E63946' : (v >= 50 ? '#00A896' : '#FFB703')), borderRadius: 8 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    })
  }

  const ctxStatus = document.getElementById('chartWorkloadStatus')
  if (ctxStatus) {
    let overload = 0, optimal = 0, underload = 0
    employees.forEach(e => {
      const pct = getEmployeeWorkloadPercent(e.id)
      if (pct > 100) overload++; else if (pct >= 50) optimal++; else underload++
    })

    if (chartStatusInstance) chartStatusInstance.destroy()
    chartStatusInstance = new Chart(ctxStatus, {
      type: 'doughnut',
      data: { labels: ['Overload', 'Optimal', 'Underload'], datasets: [{ data: [overload, optimal, underload], backgroundColor: ['#E63946', '#00A896', '#FFB703'] }] },
      options: { responsive: true, maintainAspectRatio: false }
    })
  }

  const ctxAnalyticsBar = document.getElementById('chartAnalyticsBar')
  if (ctxAnalyticsBar) {
    if (chartAnalyticsBarInstance) chartAnalyticsBarInstance.destroy()
    chartAnalyticsBarInstance = new Chart(ctxAnalyticsBar, {
      type: 'bar',
      data: {
        labels: employees.length ? employees.map(e => e.name.split(',')[0]) : ['Belum Ada Pegawai'],
        datasets: [
          { label: 'Jam Terisi', data: employees.length ? employees.map(e => getEmployeeTotalHours(e.id)) : [0], backgroundColor: '#007BFF', borderRadius: 6 },
          { label: 'Standar Jam (125h)', data: employees.length ? employees.map(() => STANDARD_EFF_HOURS) : [STANDARD_EFF_HOURS], backgroundColor: '#E2E8F0', borderRadius: 6 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    })
  }

  const ctxAnalyticsRadar = document.getElementById('chartAnalyticsRadar')
  if (ctxAnalyticsRadar) {
    if (chartAnalyticsRadarInstance) chartAnalyticsRadarInstance.destroy()
    chartAnalyticsRadarInstance = new Chart(ctxAnalyticsRadar, {
      type: 'radar',
      data: {
        labels: divisions.map(d => d.replace('Tim ', '')),
        datasets: [{ label: 'Intensitas Workload (%)', data: divAvgData, backgroundColor: 'rgba(0, 123, 255, 0.2)', borderColor: '#007BFF', pointBackgroundColor: '#002B49' }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    })
  }
}

function populateAssigneeSelect() {
  const select = document.getElementById('form-activity-assignee')
  if (!select) return
  select.innerHTML = ''
  
  if (employees.length === 0) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.text = '-- Belum Ada Pegawai --'
    select.appendChild(opt)
    return
  }

  employees.forEach(emp => {
    const opt = document.createElement('option')
    opt.value = emp.id
    opt.text = `${emp.name} (${emp.division})`
    select.appendChild(opt)
  })
}

function calculateCalculatedHours() {
  const normVal = parseFloat(document.getElementById('form-activity-norm-val').value) || 0
  const normUnit = document.getElementById('form-activity-norm-unit').value
  const vol = parseFloat(document.getElementById('form-activity-volume').value) || 0
  const normInHours = normUnit === 'menit' ? normVal / 60 : normVal
  document.getElementById('form-activity-calc-preview').innerText = `${(normInHours * vol).toFixed(2)} Jam Efektif`
}

function openModalAddActivity() {
  populateAssigneeSelect()
  document.getElementById('modal-activity-title').innerText = 'Tambah Kegiatan ABK Baru'
  document.getElementById('form-activity-id').value = ''
  document.getElementById('form-activity-name').value = ''
  document.getElementById('form-activity-norm-val').value = ''
  document.getElementById('form-activity-volume').value = ''
  document.getElementById('form-activity-start').value = '2026-09-10T08:00'
  document.getElementById('form-activity-end').value = '2026-09-25T16:00'
  document.getElementById('form-activity-progress').value = 0
  document.getElementById('form-activity-progress-label').innerText = '0%'
  calculateCalculatedHours()
  document.getElementById('modal-activity').classList.remove('hidden')
}

function openModalEditActivity(actId) {
  const act = activities.find(a => a.id === actId)
  if (!act) return
  populateAssigneeSelect()
  document.getElementById('modal-activity-title').innerText = 'Edit Kegiatan ABK'
  document.getElementById('form-activity-id').value = act.id
  document.getElementById('form-activity-name').value = act.name
  document.getElementById('form-activity-assignee').value = act.empId
  document.getElementById('form-activity-norm-val').value = act.normVal
  document.getElementById('form-activity-norm-unit').value = act.normUnit || 'jam'
  document.getElementById('form-activity-volume').value = act.volume
  document.getElementById('form-activity-start').value = act.startDate || '2026-09-01T08:00'
  document.getElementById('form-activity-end').value = act.endDate || '2026-09-30T16:00'
  document.getElementById('form-activity-progress').value = act.progress || 0
  document.getElementById('form-activity-progress-label').innerText = (act.progress || 0) + '%'
  calculateCalculatedHours()
  document.getElementById('modal-activity').classList.remove('hidden')
}

function closeModalActivity() {
  document.getElementById('modal-activity').classList.add('hidden')
}

async function handleSaveActivity(event) {
  event.preventDefault()
  const id = document.getElementById('form-activity-id').value
  const name = document.getElementById('form-activity-name').value.trim()
  const empId = document.getElementById('form-activity-assignee').value
  const normVal = parseFloat(document.getElementById('form-activity-norm-val').value) || 0
  const normUnit = document.getElementById('form-activity-norm-unit').value
  const volume = parseFloat(document.getElementById('form-activity-volume').value) || 0
  const startDate = document.getElementById('form-activity-start').value
  const endDate = document.getElementById('form-activity-end').value
  const progress = parseInt(document.getElementById('form-activity-progress').value) || 0

  if (!empId) {
    alert('Silakan daftarkan atau pilih Penanggung Jawab terlebih dahulu!')
    return
  }

  const payload = { name, empId, normVal, normUnit, volume, startDate, endDate, progress }

  try {
    if (isOfflineDemo) {
      if (id) {
        const index = activities.findIndex(a => a.id === id)
        if (index !== -1) activities[index] = { id, ...payload }
        showToast('Kegiatan ABK diperbarui!')
      } else {
        const newId = `ACT-${String(activities.length + 1).padStart(2, '0')}`
        activities.push({ id: newId, ...payload })
        showToast('Kegiatan ABK baru ditambahkan!')
      }
    } else {
      if (id) {
        await updateActivity(id, payload)
        showToast('Kegiatan ABK diperbarui!')
      } else {
        await insertActivity(payload)
        showToast('Kegiatan ABK baru ditambahkan!')
      }
      await loadAllDataFromSupabase()
    }

    closeModalActivity()
    refreshAllViews()
  } catch (err) {
    console.error('[SIMBAK] handleSaveActivity error:', err)
    showToast('Gagal menyimpan kegiatan.')
  }
}

async function handleDeleteActivity(actId) {
  if (!confirm('Yakin ingin menghapus kegiatan ini?')) return
  try {
    if (isOfflineDemo) {
      activities = activities.filter(a => a.id !== actId)
    } else {
      await deleteActivity(actId)
      await loadAllDataFromSupabase()
    }
    showToast('Kegiatan dihapus.')
    refreshAllViews()
  } catch (err) {
    console.error('[SIMBAK] handleDeleteActivity error:', err)
    showToast('Gagal menghapus kegiatan.')
  }
}

function openModalEmployeeDetail(empId) {
  const emp = employees.find(e => e.id === empId)
  if (!emp) return

  const hours = getEmployeeTotalHours(emp.id).toFixed(1)
  const percent = getEmployeeWorkloadPercent(emp.id)
  const status = getWorkloadStatus(percent)
  const empActivities = activities.filter(a => a.empId === emp.id)

  document.getElementById('modal-emp-photo').src = emp.photo || DEFAULT_PHOTO
  document.getElementById('modal-emp-name').innerText = emp.name
  document.getElementById('modal-emp-role-div').innerText = `${emp.role} • ${emp.division}`
  document.getElementById('modal-emp-hours').innerText = `${hours} Jam`
  document.getElementById('modal-emp-percent').innerText = `${percent}%`

  const badgeEl = document.getElementById('modal-emp-status-badge')
  badgeEl.innerText = status.label
  badgeEl.className = `mt-1 inline-block px-2.5 py-0.5 text-xs font-semibold rounded-md border ${status.badgeClass}`

  const listTbody = document.getElementById('modal-emp-activities-list')
  listTbody.innerHTML = ''

  if (empActivities.length === 0) {
    listTbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">Belum ada kegiatan yang dialokasikan.</td></tr>`
  } else {
    empActivities.forEach(a => {
      const actStatus = getActivityStatus(a)
      const totalHours = (getNormaHours(a) * a.volume).toFixed(1)
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td class="p-3 font-semibold text-slate-800">${a.name}</td>
        <td class="p-3 text-center">${a.normVal} ${a.normUnit}</td>
        <td class="p-3 text-center">${a.volume} Target</td>
        <td class="p-3 text-center font-bold text-bps-blue">${totalHours} h</td>
        <td class="p-3">
          <div class="space-y-1">
            <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div class="bg-bps-blue h-1.5 rounded-full" style="width: ${a.progress}%"></div>
            </div>
            <div class="text-[10px] text-slate-400 font-semibold">${a.progress}% Selesai</div>
          </div>
        </td>
        <td class="p-3 text-center">
          <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${actStatus.class}">${actStatus.label}</span>
        </td>
      `
      listTbody.appendChild(tr)
    })
  }

  document.getElementById('modal-employee-detail').classList.remove('hidden')
}

function closeModalEmployeeDetail() {
  document.getElementById('modal-employee-detail').classList.add('hidden')
}

function showToast(msg) {
  const toast = document.getElementById('toast')
  if (!toast) return
  document.getElementById('toast-message').innerText = msg
  toast.classList.remove('translate-y-20', 'opacity-0')
  toast.classList.add('translate-y-0', 'opacity-100')
  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100')
    toast.classList.add('translate-y-20', 'opacity-0')
  }, 3000)
}

function refreshAllViews() {
  renderDashboard()
  renderActivitiesTable()
  renderEmployeeGrid()
  renderCharts()
}

function exportAllCSV() {
  let csvContent = "data:text/csv;charset=utf-8,NIP,Nama Pegawai,Fungsi/Tim,Total Jam Effective,Kapasitas Std (Jam),Beban Kerja (%),Status\n"
  employees.forEach(e => {
    const hours = getEmployeeTotalHours(e.id).toFixed(1)
    const percent = getEmployeeWorkloadPercent(e.id)
    const status = getWorkloadStatus(percent).label
    csvContent += `"${e.nip}","${e.name}","${e.division}",${hours},${STANDARD_EFF_HOURS},${percent}%,"${status}"\n`
  })
  const encodedUri = encodeURI(csvContent)
  const link = document.createElement("a")
  link.setAttribute("href", encodedUri)
  link.setAttribute("download", `SI-BEBAN_BPS_Flores_Timur_Report.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  showToast("Laporan CSV diunduh!")
}

// EXPOSE KE WINDOW
Object.assign(window, {
  handleGoogleSignIn,
  handleCompleteProfileSubmit,
  handleLoginSubmit,
  handleRegisterSubmit,
  toggleSidebar,
  handleThemeToggle,
  openModalProfile,
  closeModalProfile,
  previewProfilePhoto,
  handleSaveProfile,
  toggleAuthTab,
  handleLogout,
  switchTab,
  populateAssigneeSelect,
  calculateCalculatedHours,
  openModalAddActivity,
  openModalEditActivity,
  closeModalActivity,
  handleSaveActivity,
  handleDeleteActivity,
  openModalEmployeeDetail,
  closeModalEmployeeDetail,
  exportAllCSV
})

// START
init()