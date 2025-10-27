// /api/precio.js
// Usa tu propio /api/login para obtener { sessionId: "JSESSIONID=..." }.
// Luego llama a Chess: /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4&CodArt={id}

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
  const loginUrl = `${base}/api/login`;
  const resp = await fetch(loginUrl, { headers: { 'Accept': 'application/json' } });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `Fallo /api/login (${resp.status})`);
  }
  const data = await resp.json();

  let sid = data.sessionId || data.token || data.access_token || data.JSESSIONID || data.jsessionid;
  if (!sid) throw new Error('Login no devolvió sessionId');

  // Si no trae prefijo, ponérselo (pero si ya viene como "JSESSIONID=..." lo dejamos igual)
  if (!/^JSESSIONID=/i.test(String(sid))) sid = `JSESSIONID=${sid}`;
  return sid; // Este valor se usa en el header Cookie tal cual
}

async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE
    || 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const codArt = (req.query.id ?? '').toString().trim();
  if (!codArt) return res.status(400).json({ error: 'Falta parámetro id (CodArt)' });

  const lista = '4';                   // fijo
  const fecha = formatTodayISO();      // siempre hoy (lado server)

  try {
    // 1) Obtener sessionId desde tu propio /api/login (igual que stock.js/articulo.js)
    const sessionCookie = await getSessionCookieViaLocalLogin(req);

    // 2) Construir URL EXACTA hacia Chess (casing exacto según doc)
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.set('Fecha', fecha);
    url.searchParams.set('Lista', lista);
    url.searchParams.set('CodArt', codArt);

    // 3) Consultar Chess con la cookie
    const priceResp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json'
      },
    });

    if (!priceResp.ok) {
      const text = await priceResp.text().catch(() => '');
      return res.status(priceResp.status).json({ error: text || 'Error consultando precios' });
    }

    const data = await priceResp.json().catch(() => ({}));
    const list = Array.isArray(data) ? data : [data];
    return res.status(200).json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
