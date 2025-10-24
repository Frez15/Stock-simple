// Serverless function to fetch a single article by ID from ChessERP.
// It performs authentication on each request and forwards the JSON
// response back to the client.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Read credentials from environment variables or use defaults. See
  // commentary in login.js for rationale.
  const username = process.env.CHESS_USER || 'DESARROLLOS';
  const password = process.env.CHESS_PASSWORD || '123simple';
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
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
      return res.status(loginResp.status).json({ error: text || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();
    const sessionId = loginData.sessionId || loginData.token || loginData.access_token;
    // Consultar el artículo
    const url = new URL(`${CHESS_API_BASE}/articulos/`);
    url.searchParams.append('articulo', id);
    const artResp = await fetch(url.toString(), {
      headers: { Cookie: `JSESSIONID=${sessionId}` },
    });
    if (!artResp.ok) {
      const text = await artResp.text();
      return res.status(artResp.status).json({ error: text || 'Error consultando artículo' });
    }
    const artData = await artResp.json();
    res.status(200).json(artData);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler using CommonJS so Vercel can pick up the function without ESM config
module.exports = handler;