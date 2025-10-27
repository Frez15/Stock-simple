// Serverless function to fetch the price information of an article from
// ChessERP. It authenticates on each request, requests the price list
// (default list = 4) for the current date, and returns the matching
// article's price entry. If the article is not found, returns an empty
// array.

const ARTICLE_ID_KEYS = [
  'idarticulo',
  'idArticulo',
  'articulo',
  'id',
];

const PRICE_CONTAINER_KEYS = [
  'precios',
  'lista',
  'items',
  'detalle',
  'articulos',
  'data',
  'resultado',
  'resultados',
  'articulo',
];

function getValueCaseInsensitive(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  const lowerKey = key.toLowerCase();
  const match = Object.keys(object).find(
    (candidate) => candidate.toLowerCase() === lowerKey
  );
  return match !== undefined ? object[match] : undefined;
}

function pickField(object, keys) {
  if (!object || typeof object !== 'object') return undefined;
  const entries = Object.entries(object);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    const direct = entries.find(
      ([candidate]) => candidate.toLowerCase() === lowerKey
    );
    if (direct && direct[1] !== undefined && direct[1] !== null) {
      return direct[1];
    }
  }
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    const partial = entries.find(
      ([candidate, value]) =>
        candidate.toLowerCase().includes(lowerKey) &&
        value !== undefined &&
        value !== null
    );
    if (partial) {
      return partial[1];
    }
  }
  return undefined;
}

function unwrapPriceEntries(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter((item) => item !== undefined && item !== null);
  }
  if (typeof payload !== 'object') return [];

  for (const key of PRICE_CONTAINER_KEYS) {
    const candidate = getValueCaseInsensitive(payload, key);
    if (candidate !== undefined) {
      const nested = unwrapPriceEntries(candidate);
      if (nested.length) return nested;
    }
  }

  for (const value of Object.values(payload)) {
    if (!value) continue;
    const nested = unwrapPriceEntries(value);
    if (nested.length) return nested;
  }

  return [];
}

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Always use the fixed credentials for the API. We avoid using
  // environment variables since they may still contain outdated users.
  // The username includes three r's as specified by support.
  const username = 'Desarrrollos';
  const password = '1234';
  const { id, list, date } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
  const lista = list || '4';
  // Fecha en formato YYYY-MM-DD; si no se pasa se utiliza la actual
  const hoy = date || new Date().toISOString().split('T')[0];
  const normalizedId = String(id);
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
    // La API devuelve sessionId en forma "JSESSIONID=xyz". Para evitar duplicar
    // el nombre de la cookie, se envía el valor completo tal como lo
    // proporciona ChessERP en la cabecera Cookie. Esto es equivalente a
    // enviar "Cookie: JSESSIONID=xyz" cuando el valor ya incluye el prefijo.
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.append('Fecha', hoy);
    url.searchParams.append('Lista', lista);
    const priceResp = await fetch(url.toString(), {
      headers: {
        Cookie: sessionId,
        accept: 'application/json',
      },
    });
    if (!priceResp.ok) {
      const text = await priceResp.text();
      return res.status(priceResp.status).json({ error: text || 'Error consultando precios' });
    }
    const listData = await priceResp.json();
    let entries = unwrapPriceEntries(listData);
    if (!entries.length && listData && typeof listData === 'object') {
      entries = [listData];
    }
    const normalizedId = String(id);
    const results = entries.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const candidateId = pickField(item, ARTICLE_ID_KEYS);
      if (candidateId === undefined || candidateId === null) return false;
      return String(candidateId) === normalizedId;
    });
    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

// Export handler using CommonJS so Vercel can pick up the function without ESM config
module.exports = handler;
