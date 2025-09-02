// netlify/functions/load.js
import { getAdminClient } from './_supabase.js';

const TABLE = 'planner_data';
const ROW_ID = 1;

export const handler = async () => {
  try {
    const supa = getAdminClient();
    const { data, error } = await supa.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    return {
      statusCode: 200,
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(data?.data || null),
    };
  } catch (e) {
    return { statusCode: 500, body: 'Load error' };
  }
};
