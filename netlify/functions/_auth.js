// netlify/functions/_auth.js
import crypto from 'crypto';

export const verifyToken = (token) => {
  try {
    const APP_SECRET = process.env.APP_SECRET || 'change-me-secret';
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return false;
    const expected = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
    if (expected !== sig) return false;
    const { exp } = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return exp && Date.now() < exp;
  } catch { return false; }
};
