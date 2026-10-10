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
    const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id : '';
    const status = typeof body.status === 'string' ? body.status : '';
    if (!campaignId || !status) return jsonResponse({ success: false, error: 'Campaign ID and status are required.' }, 400);
    const { data, error } = await supabase.rpc('set_campaign_status', { p_campaign_id: campaignId, p_status: status });
    if (error) return jsonResponse({ success: false, error: error.message }, error.code === '42501' ? 403 : 422);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unexpected campaign error.' }, 400);
  }
});
