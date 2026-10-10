import { userClient } from '../_shared/client.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
  try {
    const supabase = userClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ success: false, error: 'Merchant sign-in required.' }, 401);
    const body = await request.json();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const requestId = typeof body.request_id === 'string' ? body.request_id : crypto.randomUUID();
    if (!code) return jsonResponse({ success: false, error: 'Enter a redemption code.' }, 400);
    const { data, error } = await supabase.rpc('redeem_reward', { p_code: code, p_request_id: requestId });
    if (error) return jsonResponse({ success: false, error: error.message }, error.code === '42501' ? 403 : 422);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unexpected redemption error.' }, 400);
  }
});
