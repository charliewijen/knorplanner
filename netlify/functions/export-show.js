// netlify/functions/export-show.js
import { getAdminClient } from './_supabase.js';
import { verifyToken } from './_auth.js';

const TABLE = 'planner_data';
const ROW_ID = 1;

export const handler = async (event) => {
  try {
    // Auth verplicht: zelfde token als voor save()
    const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return { statusCode: 401, body: 'Unauthorized' };

    // showId uit query
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}`);
    const showId = url.searchParams.get('showId');
    if (!showId) return { statusCode: 400, body: 'Missing showId' };

    // state ophalen
    const supa = getAdminClient();
    const { data, error } = await supa.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    const s = data?.data || {};

    const show = (s.shows || []).find(x => x.id === showId);
    if (!show) return { statusCode: 404, body: 'Show not found' };

    const payload = {
      exportedAt: new Date().toISOString(),
      show,
      people:      (s.people      || []).filter(x => x.showId === showId),
      mics:        (s.mics        || []).filter(x => x.showId === showId),
      sketches:    (s.sketches    || []).filter(x => x.showId === showId),
      rehearsals:  (s.rehearsals  || []).filter(x => x.showId === showId),
      prKit:       (s.prKit       || []).filter(x => x.showId === showId),
    };

    const safe = (show.name || 'show').replace(/[^\w\-]+/g,'_');
    const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="knorplanner-${safe}-${ts}.json"`,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(payload, null, 2),
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: 'Export error' };
  }
};
