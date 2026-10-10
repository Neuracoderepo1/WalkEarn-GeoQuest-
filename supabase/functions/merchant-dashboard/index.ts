import { userClient } from '../_shared/client.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  try {
    const supabase = userClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: 'Authentication required.' }, 401);
    const { data, error } = await supabase.rpc('merchant_dashboard');
    if (error) return jsonResponse({ error: error.message }, error.code === '42501' ? 403 : 422);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected dashboard error.' }, 400);
  }
});
