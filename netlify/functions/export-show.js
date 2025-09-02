// netlify/functions/export-show.js
import { getAdminClient } from './_supabase.js';

const TABLE = 'planner_data';
const ROW_ID = 1;

export const handler = async (event) => {
  try {
    const sid = new URLSearchParams(event.queryStringParameters).get('sid');
    if (!sid) return { statusCode: 400, body: 'Missing sid' };

    const supa = getAdminClient();
    const { data, error } = await supa.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    const state = data?.data || {};

    const show = (state.shows || []).find(s => s.id === sid);
    if (!show) return { statusCode: 404, body: 'Show not found' };

    const pick = (arr=[]) => arr.filter(x => x && x.showId === sid);
    const payload = {
      exportedAt: new Date().toISOString(),
      show,
      people:     pick(state.people),
      sketches:   pick(state.sketches),
      mics:       pick(state.mics),
      rehearsals: pick(state.rehearsals),
      prKit:      pick(state.prKit),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type':'application/json',
        'Content-Disposition': `attachment; filename="show-${(show.name||'export').replace(/[^\w.-]+/g,'_')}.json"`,
      },
      body: JSON.stringify(payload, null, 2), // leesbaar
    };
  } catch (e) {
    return { statusCode: 500, body: 'Export error' };
  }
};
