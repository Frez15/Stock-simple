// Serverless function to authenticate against ChessERP.
// This function performs a POST request to the `/auth/login` endpoint using
// credentials stored in environment variables. It returns the JSON response
// (which typically includes a `sessionId` property) to the client. No
// credentials are exposed to the client; authentication is handled on the
// server side.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Read credentials from environment variables, falling back to hard-coded
  // values. This allows the function to work even if Vercel environment
  // variables are not configured. Note: hard‑coding credentials in source
  // code is generally discouraged for production systems, but is used here
  // to simplify deployment in this exercise.
  const username = process.env.CHESS_USER || 'DESARROLLOS';
  const password = process.env.CHESS_PASSWORD || '123simple';
  if (!username || !password) {
    return res
      .status(500)
      .json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }
  try {
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      const text = await loginResp.text();
      return res.status(loginResp.status).json({ error: text || 'Error de autenticación' });
    }
    const data = await loginResp.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler using CommonJS so Vercel can pick up the function without ESM config
module.exports = handler;