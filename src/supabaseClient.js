import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Sengaja tidak "throw" biar app tidak blank putih total, cukup log error
  // yang jelas supaya gampang dicari saat setup / demo.
  console.error(
    '[SIMBAK] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi. ' +
    'Cek file .env di root project (contoh ada di .env.example), lalu restart "npm run dev".'
  )
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
