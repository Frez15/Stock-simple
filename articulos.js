// /api/articulos.js
// Llama a ChessERP: /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4 (sin paginación)
// Devuelve el response crudo tal cual lo entrega Chess, para inspección.

function formatTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSelfBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const host  = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

async function getSessionCookieViaLocalLogin(req) {
  // Usa tu propio /api/login que ya autentica y retorna { sessionId: "JSESSIONID=..." }
  const base = buildSelfBaseUrl(req);
  const resp = await fetch(`${base}/api/login`, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `Fallo /api/login (${resp.status})`);
  }
  const data = await resp.json();
  let sid = data.sessionId || data.token || data.access_token || data.JSESSIONID || data.jsessionid;
  if (!sid) throw new Error('Login no devolvió sessionId');
  if (!/^JSESSIONID=/i.test(String(sid))) sid = `JSESSIONID=${sid}`;
  return sid; // listo para usar en header Cookie
}

async function handler(req, res) {
  const CHESS_API_BASE =
    process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Permití override vía query (?lista=...&fecha=...)
  const lista = (req.query.lista ?? '4').toString();
  const fecha = (req.query.fecha ?? formatTodayISO()).toString();

  try {
    const sessionCookie = await getSessionCookieViaLocalLogin(req);

    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.set('Fecha', fecha); // e.g. 2025-10-28
    url.searchParams.set('Lista', lista); // e.g. 4

    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json',
      },
    });

    const text = await r.text(); // devolvemos tal cual (texto) por si no es JSON válido
    // Intentar parsear a JSON; si falla, mandamos texto
    try {
      const json = JSON.parse(text);
      return res.status(r.ok ? 200 : r.status).json(json);
    } catch {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(r.ok ? 200 : r.status).send(text);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
