// Serverless function to fetch stock information for a given article from
// ChessERP. It authenticates on each request and queries stock from the
// configured deposit (default deposit = 1). The deposit can be overridden
// via query parameter `deposit`.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Use fixed credentials for the API. The username includes three r's.
  const username = 'Desarrrollos';
  const password = '1234';
  const { id, deposit } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
  const depositoId = deposit || 1; // Predeterminado a 1 si no se proporciona
  if (!username || !password) {
    return res
      .status(500)
      .json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }
  try {
    // Autenticar
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
    const sessionId =
      loginData.sessionId || loginData.token || loginData.access_token;

    // Consultar el stock
    const url = new URL(`${CHESS_API_BASE}/stock/`);
    url.searchParams.append('idDeposito', depositoId);
    url.searchParams.append('idArticulo', id);
    const stockResp = await fetch(url.toString(), {
      // Enviar la cookie de sesión tal cual la devuelve el login.
      headers: { Cookie: sessionId },
    });
    if (!stockResp.ok) {
      const text = await stockResp.text();
      return res
        .status(stockResp.status)
        .json({ error: text || 'Error consultando stock' });
    }
    const stockData = await stockResp.json();
    // Extraer el primer registro del array eStockFisico, si existe
    const result =
      stockData && Array.isArray(stockData.eStockFisico)
        ? stockData.eStockFisico[0]
        : stockData;
    res.status(200).json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler using CommonJS so Vercel can pick up the function without ESM config
module.exports = handler;
