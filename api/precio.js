// Serverless function to fetch the price information of an article from
// ChessERP. It authenticates on each request, requests the price list
// (default list = 4) for the current date, and returns the matching
// article's price entry. If the article is not found, returns an empty
// array.

export default async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  const username = process.env.CHESS_USER;
  const password = process.env.CHESS_PASSWORD;
  const { id, list, date } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
  const lista = list || '4';
  // Fecha en formato YYYY-MM-DD; si no se pasa se utiliza la actual
  const hoy = date || new Date().toISOString().split('T')[0];
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
    // Consultar la lista de precios
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.append('Fecha', hoy);
    url.searchParams.append('Lista', lista);
    const priceResp = await fetch(url.toString(), {
      headers: {
        Cookie: `JSESSIONID=${sessionId}`,
        accept: 'application/json',
      },
    });
    if (!priceResp.ok) {
      const text = await priceResp.text();
      return res.status(priceResp.status).json({ error: text || 'Error consultando precios' });
    }
    const listData = await priceResp.json();
    // Filtrar por artículo. Los objetos pueden usar `idArticulo` o `articulo`.
    const results = Array.isArray(listData)
      ? listData.filter(
          (item) => String(item.idArticulo ?? item.articulo) === String(id)
        )
      : [];
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}