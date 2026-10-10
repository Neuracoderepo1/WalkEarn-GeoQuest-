import { userClient } from '../_shared/client.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed.' }, 405);
  try {
    const supabase = userClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ success: false, error: 'Authentication required.' }, 401);
    const body = await request.json();
    const claimId = typeof body.claim_id === 'string' ? body.claim_id : '';
    if (!claimId) return jsonResponse({ success: false, error: 'A claim ID is required.' }, 400);
    const { data, error } = await supabase.rpc('reissue_claim_code', { p_claim_id: claimId });
    if (error) return jsonResponse({ success: false, error: error.message }, error.code === '28000' ? 401 : 422);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unexpected reissue error.' }, 400);
  }
});
