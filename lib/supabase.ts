import { createBrowserClient } from '@supabase/ssr'

// Singleton — createBrowserClient returns the same instance on repeated calls
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
