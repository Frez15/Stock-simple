// Serverless function to obtain price information for an article from ChessERP.
// It authenticates for every request and queries the `/listaPrecios/` endpoint.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  const username = process.env.CHESS_USER || 'Desarrrollos';
  const password = process.env.CHESS_PASSWORD || '1234';
  const { id, lista, fecha } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
  if (!username || !password) {
    return res
      .status(500)
      .json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }

  const targetList = lista || 4;
  const targetDate = fecha || new Date().toISOString().slice(0, 10);

  try {
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      const text = await loginResp.text();
      return res
        .status(loginResp.status)
        .json({ error: text || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();
    const sessionId = loginData.sessionId || loginData.token || loginData.access_token;

    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.append('Fecha', targetDate);
    url.searchParams.append('Lista', targetList);
    url.searchParams.append('CodArt', id);

    const priceResp = await fetch(url.toString(), {
      headers: { Cookie: `JSESSIONID=${sessionId}` },
    });
    if (!priceResp.ok) {
      const text = await priceResp.text();
      return res
        .status(priceResp.status)
        .json({ error: text || 'Error consultando precio' });
    }
    const priceData = await priceResp.json();
    res.status(200).json(priceData);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
