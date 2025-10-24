// Serverless function to fetch all articles from ChessERP. It authenticates
// on each request and returns the complete list of articles (non-annulled)
// to the client for autocompletion and searching.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Always use the fixed credentials for the API. This avoids using any
  // environment variables that may still reference outdated users. The
  // username includes three r's as specified by support.
  const username = 'Desarrrollos';
  const password = '1234';
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
    // Consultar todos los artículos
    const url = new URL(`${CHESS_API_BASE}/articulos/`);
    // Enviar la cookie tal como se devuelve en el login. No prefiere el
    // nombre de cookie porque ya está incluido.
    const artResp = await fetch(url.toString(), {
      headers: { Cookie: sessionId },
    });
    if (!artResp.ok) {
      const text = await artResp.text();
      return res.status(artResp.status).json({ error: text || 'Error consultando artículos' });
    }
    const artData = await artResp.json();
    // Normalizar a lista
    const list = Array.isArray(artData) ? artData : [artData];
    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler using CommonJS so Vercel can pick up the function without ESM config
module.exports = handler;