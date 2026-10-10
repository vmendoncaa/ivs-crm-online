import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Ingestão em quarentena: recebe o evento, mas NÃO altera leads nem agendamentos.
// Após recebermos um payload real, será criado o mapeamento aprovado BR Whats -> IVS CRM.
const MAX_BYTES = 256 * 1024;
function authorized(request) {
  const expected = process.env.BRWHATS_WEBHOOK_SECRET;
  if (!expected || expected.length < 24) return false;
  const header = request.headers['x-ivs-webhook-secret'];
  const bearer = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7) : undefined;
  const provided = Array.isArray(header) ? header[0] : header || bearer;
  if (!provided || Buffer.byteLength(provided) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
async function getRawBody(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) { const err = new Error('oversize'); err.status = 413; throw err; }
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método não permitido' }); }
  if (!authorized(req)) return res.status(401).json({ error: 'Não autorizado' });
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json'))
    return res.status(415).json({ error: 'Envie JSON' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    return res.status(503).json({ error: 'Integração ainda não configurada' });
  try {
    const raw = await getRawBody(req);
    const payload = JSON.parse(raw.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return res.status(400).json({ error: 'JSON inválido' });
    // Deduplicação por conteúdo exato. Event IDs serão mapeados após conhecer o formato real.
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error } = await client.from('brwhats_webhook_inbox').upsert({
      payload_hash: payloadHash, raw_event: payload, received_at: new Date().toISOString()
    }, { onConflict: 'payload_hash', ignoreDuplicates: true });
    if (error) { console.error('BRWhats inbox insert failed:', error.code || 'db'); return res.status(503).json({ error: 'Não foi possível registrar evento' }); }
    return res.status(202).json({ accepted: true });
  } catch (err) {
    if (err.status === 413) return res.status(413).json({ error: 'Evento muito grande' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'JSON malformado' });
    console.error('BRWhats ingest failure:', err?.name || 'error');
    return res.status(500).json({ error: 'Falha ao receber evento' });
  }
}
