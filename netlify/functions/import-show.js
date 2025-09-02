// netlify/functions/import-show.js
import { getAdminClient } from './_supabase.js';
import { verifyToken } from './_auth.js';

const TABLE = 'planner_data';
const ROW_ID = 1;
const uid = () => Math.random().toString(36).slice(2, 10);

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!verifyToken(token)) return { statusCode: 401, body: 'Unauthorized' };

    const incoming = JSON.parse(event.body || '{}');
    const { show, people=[], mics=[], sketches=[], rehearsals=[], prKit=[] } = incoming || {};
    if (!show) return { statusCode: 400, body: 'Invalid payload: "show" missing' };

    const supa = getAdminClient();
    const { data, error } = await supa.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    const base = data?.data || {};

    const newShowId = uid();
    const newShow   = { ...show, id: newShowId };

    // remap personen-ids zodat verwijzingen blijven kloppen
    const personMap = {};
    const newPeople = people.map(p => {
      const nid = uid(); personMap[p.id] = nid;
      return { ...p, id: nid, showId: newShowId };
    });

    const newMics = mics.map(m => ({ ...m, id: uid(), showId: newShowId }));

    const newSketches = sketches.map(s => {
      const roles = (s.roles || []).map(r => ({
        ...r,
        personId: r.personId ? (personMap[r.personId] || '') : r.personId,
      }));
      const micAssignments = {};
      const src = s.micAssignments || {};
      Object.keys(src).forEach(ch => {
        const pid = src[ch];
        micAssignments[ch] = pid ? (personMap[pid] || '') : '';
      });
      return { ...s, id: uid(), showId: newShowId, roles, micAssignments };
    });

    const newRehearsals = rehearsals.map(r => ({ ...r, id: uid(), showId: newShowId }));
    const newPRKit      = prKit.map(i => ({ ...i, id: uid(), showId: newShowId }));

    const next = {
      ...base,
      rev: Date.now(),
      shows:      [ ...(base.shows      || []), newShow ],
      people:     [ ...(base.people     || []), ...newPeople ],
      mics:       [ ...(base.mics       || []), ...newMics ],
      sketches:   [ ...(base.sketches   || []), ...newSketches ],
      rehearsals: [ ...(base.rehearsals || []), ...newRehearsals ],
      prKit:      [ ...(base.prKit      || []), ...newPRKit ],
    };

    const { error: upErr } = await supa.from(TABLE).upsert({ id: ROW_ID, data: next });
    if (upErr) throw upErr;

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: 'Import error' };
  }
};
