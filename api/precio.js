// Serverless function to fetch the price information of an article from
// ChessERP. It authenticates on each request, requests the price list
// (default list = 4) for the current date, and returns the matching
// article's price entry. If the article is not found, returns the closest
// match or the raw payload so the frontend can still extract values.

const ARTICLE_ID_KEYS = [
  'idarticulo',
  'idArticulo',
  'articulo',
  'codarticulo',
  'codArticulo',
  'codart',
  'CodArt',
  'codArt',
  'codigoarticulo',
  'codigoArticulo',
  'codigo',
  'id',
];

const PRICE_KEYS = [
  'preciobase',
  'precioBase',
  'preciolista',
  'precioLista',
  'precio',
  'preciofinal',
  'precioFinal',
  'precioneto',
  'precioNeto',
  'importe',
  'importeBase',
  'importeFinal',
  'importeConIva',
];

function normalizeArticleId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function trimLeadingZeros(value) {
  if (typeof value !== 'string') value = normalizeArticleId(value);
  if (!value) return value;
  const trimmed = value.replace(/^0+/, '');
  return trimmed.length ? trimmed : '0';
}

function isPrimitive(value) {
  const type = typeof value;
  return (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    value instanceof Date
  );
}

function matchesKey(candidate, keys) {
  const lowerCandidate = candidate.toLowerCase();
  return keys.some((key) => {
    const lowerKey = key.toLowerCase();
    return (
      lowerCandidate === lowerKey || lowerCandidate.includes(lowerKey)
    );
  });
}

function pickField(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  const entries = Object.entries(source);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    const direct = entries.find(
      ([candidate]) => candidate.toLowerCase() === lowerKey
    );
    if (direct) {
      const value = direct[1];
      if (isPrimitive(value)) return value;
    }
  }
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    const partial = entries.find(([candidate, value]) => {
      if (!isPrimitive(value)) return false;
      return candidate.toLowerCase().includes(lowerKey);
    });
    if (partial) {
      return partial[1];
    }
  }
  return undefined;
}

function hasPriceInfo(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (pickField(candidate, ARTICLE_ID_KEYS) !== undefined) return true;
  return pickField(candidate, PRICE_KEYS) !== undefined;
}

function collectEntries(payload, bucket = [], visited = new Set()) {
  if (payload === null || payload === undefined) return bucket;
  const type = typeof payload;
  if (type !== 'object') return bucket;
  if (visited.has(payload)) return bucket;
  visited.add(payload);

  if (Array.isArray(payload)) {
    for (const item of payload) {
      collectEntries(item, bucket, visited);
    }
    return bucket;
  }

  if (hasPriceInfo(payload)) {
    bucket.push(payload);
  }

  for (const value of Object.values(payload)) {
    collectEntries(value, bucket, visited);
  }

  return bucket;
}

function collectArticleIds(payload, collector, visited = new Set()) {
  if (payload === null || payload === undefined) return;
  const type = typeof payload;
  if (type !== 'object') return;
  if (visited.has(payload)) return;
  visited.add(payload);

  if (Array.isArray(payload)) {
    for (const item of payload) {
      collectArticleIds(item, collector, visited);
    }
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !(value instanceof Date)) {
      collectArticleIds(value, collector, visited);
      continue;
    }
    if (!isPrimitive(value)) continue;
    if (!matchesKey(key, ARTICLE_ID_KEYS)) continue;
    const normalized = normalizeArticleId(value);
    const trimmed = trimLeadingZeros(normalized);
    if (normalized) collector.add(normalized);
    if (trimmed) collector.add(trimmed);
  }
}

function buildRequestedIds(id) {
  const normalized = normalizeArticleId(id);
  const comparable = trimLeadingZeros(normalized);
  const result = new Set();
  if (normalized) result.add(normalized);
  if (comparable) result.add(comparable);
  if (/^\d+$/.test(normalized)) {
    result.add(normalized.padStart(6, '0'));
    result.add(normalized.padStart(13, '0'));
  }
  return result;
}

async function extractSessionId(loginResp) {
  let sessionId;
  try {
    const data = await loginResp.clone().json();
    sessionId =
      data.sessionId || data.token || data.access_token || data.cookie;
  } catch (_) {
    sessionId = undefined;
  }

  if (!sessionId) {
    const rawCookie = loginResp.headers.get('set-cookie');
    if (rawCookie) {
      const cookieParts = rawCookie
        .split(',')
        .map((part) => part.trim())
        .find((part) => part.toUpperCase().includes('JSESSIONID='));
      if (cookieParts) {
        sessionId = cookieParts.split(';')[0];
      }
    }
  }

  if (typeof sessionId === 'string' && !sessionId.includes('=')) {
    sessionId = `JSESSIONID=${sessionId}`;
  }

  return sessionId;
}

async function requestPriceList(sessionId, baseUrl, params) {
  const url = new URL(`${baseUrl}/listaPrecios/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.append(key, value);
  });
  const response = await fetch(url.toString(), {
    headers: {
      Cookie: sessionId,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || 'Error consultando precios');
    error.status = response.status;
    throw error;
  }
  return response;
}

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  const username = 'Desarrrollos';
  const password = '1234';
  const { id, list, date } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
  if (!username || !password) {
    return res
      .status(500)
      .json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }

  const lista = list || '4';
  const hoy = date || new Date().toISOString().split('T')[0];
  const requestedIds = buildRequestedIds(id);

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

    const sessionId = await extractSessionId(loginResp);
    if (!sessionId) {
      return res
        .status(500)
        .json({ error: 'No se pudo obtener la sesión de ChessERP' });
    }

    const collectedResults = [];
    let lastPayload = null;
    let lastError = null;

    const performRequest = async (params) => {
      try {
        const response = await requestPriceList(sessionId, CHESS_API_BASE, params);
        const payload = await response.json();
        lastPayload = payload;
        return collectEntries(payload);
      } catch (error) {
        lastError = error;
        console.error('Error solicitando lista de precios', {
          url: `${CHESS_API_BASE}/listaPrecios/`,
          params,
          status: error.status || null,
          message: error.message,
        });
        return null;
      }
    };

    for (const candidate of requestedIds) {
      const entries = await performRequest({
        Fecha: hoy,
        Lista: lista,
        CodArt: candidate,
      });
      if (!entries || !entries.length) continue;
      const matches = entries.filter((entry) => {
        const ids = new Set();
        collectArticleIds(entry, ids);
        for (const requested of requestedIds) {
          if (ids.has(requested)) return true;
        }
        return false;
      });
      if (matches.length) {
        return res.status(200).json(matches);
      }
      if (entries && entries.length) {
        collectedResults.push(...entries);
      }
    }

    const fallbackEntries =
      (await performRequest({
        Fecha: hoy,
        Lista: lista,
      })) || [];
    const filteredFallback = fallbackEntries.filter((entry) => {
      const ids = new Set();
      collectArticleIds(entry, ids);
      for (const requested of requestedIds) {
        if (ids.has(requested)) return true;
      }
      return false;
    });

    if (filteredFallback.length) {
      return res.status(200).json(filteredFallback.slice(0, 50));
    }

    const combined = collectedResults.concat(fallbackEntries);
    if (combined.length) {
      return res.status(200).json(combined.slice(0, 50));
    }

    if (lastPayload !== null) {
      return res.status(200).json(lastPayload);
    }

    if (lastError) {
      const status = lastError.status || 500;
      return res
        .status(status)
        .json({ error: lastError.message || 'Error consultando precios' });
    }

    return res.status(200).json([]);
  } catch (err) {
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
