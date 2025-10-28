// /api/articulos.js
// Devuelve todos los artículos desde ChessERP, sin necesidad de pasar un ID.
// Se autentica en cada request y reenvía la lista cruda que devuelve Chess.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Credenciales fijas (usuario con tres erres)
  const username = 'Desarrrollos';
  const password = '1234';

  if (!username || !password) {
    return res
      .status(500)
      .json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
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
      return res
        .status(loginResp.status)
        .json({ error: text || 'Error de autenticación' });
    }

    const loginData = await loginResp.json();
    const sessionId =
      loginData.sessionId || loginData.token || loginData.access_token;

    if (!sessionId) {
      return res.status(500).json({ error: 'Login no devolvió sessionId' });
    }

    // 2) Consultar todos los artículos
    const url = new URL(`${CHESS_API_BASE}/articulos/`);
    const artResp = await fetch(url.toString(), {
      headers: { Cookie: sessionId },
    });

    if (!artResp.ok) {
      const text = await artResp.text();
      return res
        .status(artResp.status)
        .json({ error: text || 'Error consultando artículos' });
    }

    const artData = await artResp.json();

    // Si el backend responde con {eArticulos:[...]}, aplanamos
    let list = [];
    if (artData && Array.isArray(artData.eArticulos)) {
      list = artData.eArticulos;
    } else if (Array.isArray(artData)) {
      list = artData;
    } else {
      list = [artData];
    }

    return res.status(200).json(list);
  } catch (err) {
    return res
      .status(500)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler con CommonJS (para Vercel/Next)
module.exports = handler;
