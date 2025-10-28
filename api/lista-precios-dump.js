// /api/lista-precios-dump.js
// Pega a /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4
// Devuelve: { debug: { called, lista, fecha }, keys, data }

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
  return sid;
}

async function handler(req, res) {
  const CHESS_API_BASE =
    process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const lista = (req.query.lista ?? '4').toString();
  const fecha = (req.query.fecha ?? formatTodayISO()).toString();

  try {
    const sessionCookie = await getSessionCookieViaLocalLogin(req);

    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.set('Fecha', fecha);
    url.searchParams.set('Lista', lista);

    // anti-cache para ver siempre lo último
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Cookie': sessionCookie, 'Accept': 'application/json' },
    });

    const text = await r.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(text); } catch { /* puede venir texto */ }

    const keys = data && typeof data === 'object'
      ? Array.isArray(data)
        ? [`[array length=${data.length}]`]
        : Object.keys(data)
      : ['<no-json>'];

    // Encabezado de depuración para verlo en Network → Headers
    res.setHeader('X-Debug-Endpoint', url.toString());

    return res.status(r.ok ? 200 : r.status).json({
      debug: { called: url.toString(), lista, fecha, http: r.status },
      keys,
      data: data ?? text,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
