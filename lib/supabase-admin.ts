import { createClient } from '@supabase/supabase-js'

// Etapa 20: cliente service_role — bypassea RLS. Sólo usar en API routes que ya
// verificaron `supabase.auth.getUser()` con el cliente normal antes de llamar a esto
// (tracking_portfolios/tracking_trades no tienen policy pública, ver Etapa 19).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
