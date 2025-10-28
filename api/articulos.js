// /api/articulos.js
// Devuelve lista simple de artículos para autocompletar
// Fuente: /listaPrecios?Fecha=HOY&Lista=4

function formatTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSelfBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

async function getSessionCookieViaLocalLogin(req) {
  const base = buildSelfBaseUrl(req);
  const loginUrl = `${base}/api/login`;
  const resp = await fetch(loginUrl, { headers: { 'Accept': 'application/json' } });
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

  const fecha = formatTodayISO();
  const lista = '4';

  try {
    const sessionCookie = await getSessionCookieViaLocalLogin(req);

    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.set('Fecha', fecha);
    url.searchParams.set('Lista', lista);

    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json'
      },
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return res.status(r.status).json({ error: text || 'Error consultando listaPrecios' });
    }

    const data = await r.json();

    // Navegamos a dsListaPreciosApi.eListaPrecios
    const listaPrecios = data?.dsListaPreciosApi?.eListaPrecios || [];

    // Normalizamos solo id y descripción
    const normalized = listaPrecios.map(it => ({
      idArticulo: it.id_articulo ?? it.idArticulo ?? null,
      desArticulo: it.des_articulo ?? it.desArticulo ?? '',
    })).filter(it => it.idArticulo);

    return res.status(200).json(normalized);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
