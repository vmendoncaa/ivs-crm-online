import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// BR Whats -> inbox, sem automação sobre os leads até conhecermos o payload.
// HMAC: o nome do cabeçalho e o formato da assinatura DEVEM ser configurados
// com a documentação do provedor (não presumir um formato específico).
const MAX_BYTES = 256 * 1024;

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body !== undefined) throw Object.assign(new Error('body already parsed'), { status: 400 });
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('body too large'), { status: 413 });
    parts.push(part);
  }
  return Buffer.concat(parts);
}

function configured() {
  return Boolean(process.env.BRWHATS_WEBHOOK_SECRET &&
    process.env.BRWHATS_WEBHOOK_SECRET.length >= 24 &&
    process.env.BRWHATS_SIGNATURE_HEADER &&
    ['hex', 'sha256-hex', 'base64'].includes(process.env.BRWHATS_SIGNATURE_FORMAT || ''));
}

function verified(req, raw) {
  if (!configured()) return false;
  const header = process.env.BRWHATS_SIGNATURE_HEADER.toLowerCase();
  const value = req.headers[header];
  const signature = Array.isArray(value) ? value[0] : value;
  if (typeof signature !== 'string') return false;
  const format = process.env.BRWHATS_SIGNATURE_FORMAT;
  const hmac = createHmac('sha256', process.env.BRWHATS_WEBHOOK_SECRET).update(raw);
  const expected = format === 'base64' ? hmac.digest('base64') : hmac.digest('hex');
  const provided = format === 'sha256-hex'
    ? (signature.startsWith('sha256=') ? signature.slice(7) : '') : signature;
  const normExpected = format === 'base64' ? expected : expected.toLowerCase();
  const normProvided = format === 'base64' ? provided : provided.toLowerCase();
  const a = Buffer.from(normExpected, 'utf8');
  const b = Buffer.from(normProvided, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({
    service: 'ivs-brwhats-webhook', status: 'online',
    signature_configured: configured(),
    database_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!configured()) return res.status(503).json({ error: 'signature_configuration_pending' });
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json'))
    return res.status(415).json({ error: 'json_required' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return res.status(503).json({ error: 'database_configuration_pending' });
  try {
    const raw = await rawBody(req);
    if (raw.length > MAX_BYTES) return res.status(413).json({ error: 'body_too_large' });
    if (!verified(req, raw)) {
      // Somente nomes de headers, nunca valores/segredos/corpos.
      console.warn('BRWhats rejected signature, header names:', Object.keys(req.headers).filter(h => !['cookie','authorization'].includes(h)).join(','));
      return res.status(401).json({ error: 'invalid_signature' });
    }
    const event = JSON.parse(raw.toString('utf8'));
    if (!event || typeof event !== 'object' || Array.isArray(event))
      return res.status(400).json({ error: 'invalid_event' });
    const hash = createHash('sha256').update(raw).digest('hex');
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await client.from('brwhats_webhook_inbox').upsert(
      { payload_hash: hash, raw_event: event, received_at: new Date().toISOString() },
      { onConflict: 'payload_hash', ignoreDuplicates: true }
    );
    if (error) {
      console.error('BRWhats inbox insert error', error.code || 'db_error');
      return res.status(503).json({ error: 'inbox_unavailable' });
    }
    return res.status(202).json({ accepted: true });
  } catch (e) {
    if (e.status === 413) return res.status(413).json({ error: 'body_too_large' });
    if (e.status === 400) return res.status(400).json({ error: 'raw_body_unavailable' });
    if (e instanceof SyntaxError) return res.status(400).json({ error: 'invalid_json' });
    console.error('BRWhats handler error', e.name || 'error');
    return res.status(500).json({ error: 'unexpected_error' });
  }
}
