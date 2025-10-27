// /api/articulos.js
// Trae todos los artículos no anulados de ChessERP para autocompletado.
// - Reutiliza /api/login para obtener { sessionId: "JSESSIONID=..." }.
// - Desanida dsArticulosApi -> eArticulos (y variantes), tolerando estructuras anidadas.

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
  return sid; // se usa tal cual en Cookie
}

// Busca en cualquier nivel un array eArticulos
function extractEArticulos(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    // Por si vino como [ { dsArticulosApi: { eArticulos: [...] } }, ... ]
    let acc = [];
    for (const item of payload) acc = acc.concat(extractEArticulos(item));
    return acc;
  }
  if (typeof payload === 'object') {
    // Caso habitual: { dsArticulosApi: { eArticulos: [...] } }
    if (payload.dsArticulosApi && Array.isArray(payload.dsArticulosApi.eArticulos)) {
      return payload.dsArticulosApi.eArticulos;
    }
    if (Array.isArray(payload.eArticulos)) {
      return payload.eArticulos;
    }
    // Buscar recursivo en valores
    let acc = [];
    for (const v of Object.values(payload)) {
      acc = acc.concat(extractEArticulos(v));
    }
    return acc;
  }
  return [];
}

async function handler(req, res) {
  const CHESS_API_BASE =
    process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  try {
    // 1) Cookie de sesión (como en stock/precio)
    const sessionCookie = await getSessionCookieViaLocalLogin(req);

    // 2) Llamado a /articulos/ (intentamos filtrar no anulados en la query)
    const url = new URL(`${CHESS_API_BASE}/articulos/`);
    // Si tu API no soporta este param, lo ignorará sin romper
    url.searchParams.set('Anulado', 'false');

    const artResp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json'
      },
    });

    if (!artResp.ok) {
      const text = await artResp.text().catch(() => '');
      return res.status(artResp.status).json({ error: text || 'Error consultando artículos' });
    }

    const artData = await artResp.json().catch(() => ({}));
    let allArticles = extractEArticulos(artData);

    // 3) Filtro final de no anulados (por si el backend no aplicó Anulado=false)
    allArticles = allArticles.filter(a => {
      const anulado = a?.Anulado ?? a?.anulado ?? a?.ANULADO;
      return anulado === false || anulado === 0 || anulado === '0' || anulado === 'false' || anulado === undefined;
    });

    return res.status(200).json(allArticles);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
