// netlify/functions/save.js
import { getAdminClient } from './_supabase.js';
import { verifyToken } from './_auth.js';

const TABLE = 'planner_data';
const ROW_ID = 1;

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const auth = event.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!verifyToken(token)) return { statusCode: 401, body: 'Unauthorized' };

    const nextState = JSON.parse(event.body || '{}');
    const supa = getAdminClient();
    const { error } = await supa.from(TABLE).upsert({ id: ROW_ID, data: nextState });
    if (error) throw error;

    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    return { statusCode: 500, body: 'Save error' };
  }
};
