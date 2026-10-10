import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

export function userClient(request: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anon || !authorization) throw new Error('Missing Supabase configuration or authorization.');
  return createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
