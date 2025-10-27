// /api/precio.js
// Serverless function to fetch price information for an article from ChessERP.
// Query params:
//   - id    : Código de artículo (CodArt)
//   - lista : Código/desc de lista de precios (default: process.env.DEFAULT_PRICE_LIST || '4')
//   - fecha : Fecha de vigencia (YYYY-MM-DD). Si no se envía, usa la vigente.
// Devuelve el JSON de /listaPrecios/ (lista o único objeto, según responda la API).

async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const username = process.env.CHESS_USER || 'Desarrrollos';
  const password = process.env.CHESS_PASSWORD || '1234';
  if (!username || !password) {
    return res.status(500).json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }

  // Leer query
  const codArt = (req.query.id ?? '').toString().trim();
  const lista  = (req.query.lista ?? process.env.DEFAULT_PRICE_LIST ?? '4').toString().trim();
  const fecha  = (req.query.fecha ?? '').toString().trim();

  if (!codArt) {
    return res.status(400).json({ error: 'Falta parámetro id (CodArt)' });
  }

  try {
    // 1) Login
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

    // sessionId puede venir ya como "JSESSIONID=...."
    let sessionCookie = loginData.sessionId || loginData.token || loginData.access_token;
    if (!sessionCookie) {
      return res.status(500).json({ error: 'No se recibió sessionId en el login' });
    }
    if (!/^JSESSIONID=/.test(sessionCookie)) {
      sessionCookie = `JSESSIONID=${sessionCookie}`;
    }

    // 2) Build URL /listaPrecios/
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    if (lista)  url.searchParams.set('Lista', lista);
    if (codArt) url.searchParams.set('CodArt', codArt);
    if (fecha)  url.searchParams.set('Fecha', fecha); // opcional

    // 3) GET precios
    const priceResp = await fetch(url.toString(), {
      method: 'GET',
      headers: { Cookie: sessionCookie },
    });

    if (!priceResp.ok) {
      const text = await priceResp.text();
      return res.status(priceResp.status).json({ error: text || 'Error consultando precios' });
    }

    const data = await priceResp.json();

    // 4) Normalizar: si viene objeto, envolver en array para frontend homogéneo
    const list = Array.isArray(data) ? data : [data];
    return res.status(200).json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
