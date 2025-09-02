// netlify/functions/import-show.js
import { getAdminClient } from './_supabase.js';
import { verifyToken } from './_auth.js';
import crypto from 'crypto';

const TABLE = 'planner_data';
const ROW_ID = 1;
const uid = () => crypto.randomUUID();

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const auth = event.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!verifyToken(token)) return { statusCode: 401, body: 'Unauthorized' };

    const body = JSON.parse(event.body || '{}');
    const { show, people=[], sketches=[], mics=[], rehearsals=[], prKit=[] } = body || {};
    if (!show) return { statusCode: 400, body: 'Missing show in payload' };

    const supa = getAdminClient();
    const { data, error } = await supa.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    const state = data?.data || {};

    // nieuw showId + remap ids
    const newShowId = uid();

    const cloneArr = (arr=[]) => arr.map(x => ({ ...x })); // shallow clone
    const newShow = { ...show, id: newShowId };

    // maak nieuwe IDs voor sub-objecten
    const remapIds = (arr=[]) => arr.map(x => ({ ...x, id: uid(), showId: newShowId }));
    const newPeople     = remapIds(people);
    const newMics       = remapIds(mics);
    const newRehearsals = remapIds(rehearsals);

    // Sketches + nested referenties (roles/personId blijven leeg als die id’s niet bestaan in newPeople)
    const personIdMap = Object.fromEntries((people||[]).map((p,i) => [p.id, newPeople[i]?.id]));
    const fixSketch = (sk) => {
      const clone = { ...sk, id: uid(), showId: newShowId };
      if (Array.isArray(clone.roles)) {
        clone.roles = clone.roles.map(r => ({
          ...r,
          personId: r.personId ? (personIdMap[r.personId] || "") : "",
        }));
      }
      if (clone.micAssignments && typeof clone.micAssignments === 'object') {
        const ma = {};
        Object.entries(clone.micAssignments).forEach(([ch,pid]) => {
          ma[ch] = pid ? (personIdMap[pid] || "") : "";
        });
        clone.micAssignments = ma;
      }
      return clone;
    };
    const newSketches = (sketches||[]).map(fixSketch);

    const newPRKit = remapIds(prKit);

    // append in state
    const next = {
      ...state,
      shows:      [...(state.shows||[]), newShow],
      people:     [...(state.people||[]), ...newPeople],
      mics:       [...(state.mics||[]), ...newMics],
      rehearsals: [...(state.rehearsals||[]), ...newRehearsals],
      sketches:   [...(state.sketches||[]), ...newSketches],
      prKit:      [...(state.prKit||[]), ...newPRKit],
      rev: Date.now(),
    };

    const { error: upErr } = await supa.from(TABLE).upsert({ id: ROW_ID, data: next });
    if (upErr) throw upErr;

    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ ok:true, newShowId }),
    };
  } catch (e) {
    return { statusCode: 500, body: 'Import error' };
  }
};
