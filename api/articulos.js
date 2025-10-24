// Serverless function to fetch all articles from ChessERP. It authenticates
// on each request and returns the complete list of articles (non-annulled)
// to the client for autocompletion and searching.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Use fixed credentials for the API. The username includes three r's.
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
      return res
        .status(loginResp.status)
        .json({ error: text || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();
    const sessionId =
      loginData.sessionId || loginData.token || loginData.access_token;

    // Consultar todos los artículos
    const url = new URL(`${CHESS_API_BASE}/articulos/`);
    const artResp = await fetch(url.toString(), {
      // Enviar la cookie tal como se devuelve en el login.
      headers: { Cookie: sessionId },
    });
    if (!artResp.ok) {
      const text = await artResp.text();
      return res
        .status(artResp.status)
        .json({ error: text || 'Error consultando artículos' });
    }
    const artData = await artResp.json();

    // Aplanar la lista de artículos. La API devuelve un objeto con eArticulos
    // o bien un array de objetos que contienen eArticulos.
    let allArticles = [];
    if (artData && Array.isArray(artData.eArticulos)) {
      // Caso simple: artData = { eArticulos: [...] }
      allArticles = artData.eArticulos;
    } else if (Array.isArray(artData)) {
      // Caso complejo: artData = [ { eArticulos: [...] }, { eArticulos: [...] }, ... ]
      artData.forEach((block) => {
        if (block && Array.isArray(block.eArticulos)) {
          allArticles.push(...block.eArticulos);
        }
      });
    }
    res.status(200).json(allArticles);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler using CommonJS so Vercel can pick up the function without ESM config
module.exports = handler;
