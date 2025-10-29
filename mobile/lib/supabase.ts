import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeout?: number } = {}) {
  const { timeout = 8000, ...rest } = init;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);
