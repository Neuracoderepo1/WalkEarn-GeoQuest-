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
    const questId = typeof body.quest_id === 'string' ? body.quest_id : '';
    const latitude = Number(body.latitude); const longitude = Number(body.longitude); const accuracy = Number(body.accuracy_m);
    if (!questId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
      return jsonResponse({ success: false, error: 'Quest ID and a valid location fix are required.' }, 400);
    }
    const { data, error } = await supabase.rpc('claim_quest', {
      p_quest_id: questId, p_latitude: latitude, p_longitude: longitude, p_accuracy_m: accuracy,
    });
    if (error) return jsonResponse({ success: false, error: error.message }, error.code === '28000' ? 401 : 422);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unexpected claim error.' }, 400);
  }
});
