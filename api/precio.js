// /api/precio.js
// Consulta de precios de ChessERP por artículo.
// Parámetros (query):
//   - id    : Código de artículo (CodArt) [obligatorio]
//   - lista : Lista de precios (default: process.env.DEFAULT_PRICE_LIST || '4')
//   - fecha : YYYY-MM-DD [obligatoria] (si no llega, se fuerza a "hoy" del servidor)

function formatTodayISO() {
  const now = new Date(); // fecha del servidor
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const username = process.env.CHESS_USER || 'Desarrrollos';
  const password = process.env.CHESS_PASSWORD || '1234';
  if (!username || !password) {
    return res.status(500).json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }

  const codArt = (req.query.id ?? '').toString().trim();
  const lista  = (req.query.lista ?? process.env.DEFAULT_PRICE_LIST ?? '4').toString().trim();
  let fecha    = (req.query.fecha ?? '').toString().trim();

  if (!codArt) {
    return res.status(400).json({ error: 'Falta parámetro id (CodArt)' });
  }
  if (!fecha) {
    // La fecha ES obligatoria; si no vino, forzamos hoy (lado servidor)
    fecha = formatTodayISO();
  }

  try {
    // Login
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      const text = await loginResp.text();
      return res.status(loginResp.status).json({ error: text || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();

    let sessionCookie = loginData.sessionId || loginData.token || loginData.access_token;
    if (!sessionCookie) {
      return res.status(500).json({ error: 'No se recibió sessionId en el login' });
    }
    if (!/^JSESSIONID=/.test(sessionCookie)) {
      sessionCookie = `JSESSIONID=${sessionCookie}`;
    }

    // URL de precios
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.set('Lista', lista);
    url.searchParams.set('CodArt', codArt);
    url.searchParams.set('Fecha', fecha); // siempre enviamos fecha

    // GET precios
    const priceResp = await fetch(url.toString(), {
      method: 'GET',
      headers: { Cookie: sessionCookie },
    });
    if (!priceResp.ok) {
      const text = await priceResp.text();
      return res.status(priceResp.status).json({ error: text || 'Error consultando precios' });
    }

    const data = await priceResp.json();
    const list = Array.isArray(data) ? data : [data]; // homogeneizamos a lista
    return res.status(200).json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
