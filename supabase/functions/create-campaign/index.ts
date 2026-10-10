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
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const reward = typeof body.reward_description === 'string' ? body.reward_description.trim() : '';
    const limit = Number(body.redemption_limit);
    const fee = Number(body.fee_per_redemption);
    const locationId = typeof body.location_id === 'string' && body.location_id ? body.location_id : null;
    if (!title || !reward || !Number.isInteger(limit) || !Number.isFinite(fee)) return jsonResponse({ success: false, error: 'Campaign title, reward, integer limit, and fee are required.' }, 400);
    const { data, error } = await supabase.rpc('create_merchant_campaign', {
      p_title: title, p_reward_description: reward, p_redemption_limit: limit,
      p_fee_per_redemption: fee, p_location_id: locationId,
      p_starts_at: body.starts_at || new Date().toISOString(), p_ends_at: body.ends_at || null,
    });
    if (error) return jsonResponse({ success: false, error: error.message }, error.code === '42501' ? 403 : 422);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unexpected campaign error.' }, 400);
  }
});
