// netlify/functions/pw.js
import crypto from 'crypto';

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { password } = JSON.parse(event.body || '{}');
    const APP_PASSWORD = process.env.APP_PASSWORD || 'Appelsap123!';
    const APP_SECRET   = process.env.APP_SECRET   || 'change-me-secret'; // HMAC sleutel

    if (!password || password !== APP_PASSWORD) {
      return { statusCode: 401, body: 'Unauthorized' };
    }

    // simpele HMAC "token" met expiry (10 minuten)
    const exp = Date.now() + 10 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64');
    const sig = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
    const token = `${payload}.${sig}`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, exp }),
    };
  } catch (e) {
    return { statusCode: 500, body: 'Error' };
  }
};
