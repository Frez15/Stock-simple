const CHESS_API_BASE =
  'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
const DEFAULT_PRICE_LIST = '4';

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

function normalizeId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function stripLeadingZeros(value) {
  const normalized = normalizeId(value);
  if (!normalized) return normalized;
  const trimmed = normalized.replace(/^0+/, '');
  return trimmed.length ? trimmed : '0';
}

function buildCandidateIds(id) {
  const base = normalizeId(id);
  const trimmed = stripLeadingZeros(base);
  const candidates = new Set();
  if (base) candidates.add(base);
  if (trimmed) candidates.add(trimmed);
  if (/^\d+$/.test(trimmed)) {
    candidates.add(trimmed.padStart(6, '0'));
    candidates.add(trimmed.padStart(13, '0'));
  }
  return Array.from(candidates).filter(Boolean);
}

function readInlineCookie(loginData) {
  if (!loginData || typeof loginData !== 'object') return null;
  return (
    loginData.sessionId ||
    loginData.token ||
    loginData.access_token ||
    loginData.cookie ||
    null
  );
}

function parseCookiePair(value) {
  if (!value) return null;
  if (value.includes('=')) {
    return value.split(';')[0].trim();
  }
  return `JSESSIONID=${value.trim()}`;
}

async function extractSessionCookie(response) {
  const cookieSet = new Set();

  try {
    const data = await response.clone().json();
    const inline = parseCookiePair(readInlineCookie(data));
    if (inline) cookieSet.add(inline);
  } catch (_) {
    // Ignore JSON parsing issues; cookie might only be present in headers.
  }

  const rawHeaders =
    typeof response.headers.raw === 'function'
      ? response.headers.raw()['set-cookie']
      : response.headers.get('set-cookie');

  const headerValues = Array.isArray(rawHeaders)
    ? rawHeaders
    : typeof rawHeaders === 'string'
    ? rawHeaders.split(/,(?=[^ ;]+=)/)
    : [];

  for (const entry of headerValues) {
    const cookie = parseCookiePair(entry);
    if (cookie) cookieSet.add(cookie);
  }

  if (!cookieSet.size) return null;
  return Array.from(cookieSet).join('; ');
}

function isPrimitive(value) {
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean';
}

function matchesKnownKey(key, knownKeys) {
  const lowerKey = key.toLowerCase();
  return knownKeys.some((candidate) => {
    const lowerCandidate = candidate.toLowerCase();
    return lowerKey === lowerCandidate || lowerKey.includes(lowerCandidate);
  });
}

function looksLikePriceEntry(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }
  const entries = Object.entries(candidate);
  const hasArticleKey = entries.some(([key, value]) => {
    return isPrimitive(value) && matchesKnownKey(key, ARTICLE_ID_KEYS);
  });
  const hasPriceKey = entries.some(([key, value]) => {
    return isPrimitive(value) && matchesKnownKey(key, PRICE_KEYS);
  });
  return hasArticleKey || hasPriceKey;
}

function collectEntries(payload) {
  if (payload === null || payload === undefined) return [];
  const bucket = [];
  const queue = [payload];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (looksLikePriceEntry(current)) {
      bucket.push(current);
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return bucket;
}

function collectEntryIds(entry) {
  const ids = new Set();
  if (!entry || typeof entry !== 'object') return ids;

  const stack = [entry];
  const visited = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (value && typeof value === 'object') {
        stack.push(value);
        continue;
      }
      if (!isPrimitive(value)) continue;
      if (!matchesKnownKey(key, ARTICLE_ID_KEYS)) continue;
      const normalized = normalizeId(value);
      const trimmed = stripLeadingZeros(normalized);
      if (normalized) ids.add(normalized);
      if (trimmed) ids.add(trimmed);
    }
  }

  return ids;
}

function filterEntriesByIds(entries, candidateIds) {
  if (!entries || !entries.length) return [];
  const candidateSet = new Set(candidateIds.map(normalizeId).filter(Boolean));
  if (!candidateSet.size) return entries;

  return entries.filter((entry) => {
    const entryIds = collectEntryIds(entry);
    for (const id of entryIds) {
      if (candidateSet.has(normalizeId(id))) {
        return true;
      }
    }
    return false;
  });
}

async function performPriceRequest(sessionCookie, params) {
  const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Cookie: sessionCookie,
      cookie: sessionCookie,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || 'Error consultando precios');
    error.status = response.status;
    throw error;
  }

  try {
    return await response.json();
  } catch (err) {
    throw new Error('No se pudo interpretar la respuesta de precios');
  }
}

async function handler(req, res) {
  const username = process.env.CHESS_USER || 'Desarrrollos';
  const password = process.env.CHESS_PASSWORD || '1234';
  const { id, list, date } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }

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
      return res
        .status(loginResp.status)
        .json({ error: text || 'Error de autenticación' });
    }

    const sessionCookie = await extractSessionCookie(loginResp);
    if (!sessionCookie) {
      return res
        .status(500)
        .json({ error: 'No se pudo obtener la sesión de ChessERP' });
    }

    const lista = list || DEFAULT_PRICE_LIST;
    const fecha = date || new Date().toISOString().split('T')[0];
    const candidateIds = buildCandidateIds(id);

    const collectedEntries = [];
    let fallbackPayload = null;
    let lastError = null;

    const attemptRequest = async (params) => {
      try {
        const payload = await performPriceRequest(sessionCookie, params);
        const entries = collectEntries(payload);
        return { payload, entries };
      } catch (error) {
        lastError = error;
        console.error('Error solicitando lista de precios', {
          params,
          status: error.status || null,
          message: error.message,
        });
        return { payload: null, entries: [] };
      }
    };

    for (const candidate of candidateIds) {
      const { payload, entries } = await attemptRequest({
        Fecha: fecha,
        Lista: lista,
        CodArt: candidate,
      });

      if (!entries.length) continue;
      const filtered = filterEntriesByIds(entries, candidateIds);
      if (filtered.length) {
        return res.status(200).json(filtered);
      }
      collectedEntries.push(...entries);
      fallbackPayload = payload || fallbackPayload;
    }

    if (!collectedEntries.length) {
      const { payload, entries } = await attemptRequest({
        Fecha: fecha,
        Lista: lista,
      });
      fallbackPayload = payload || fallbackPayload;
      const filtered = filterEntriesByIds(entries, candidateIds);
      if (filtered.length) {
        return res.status(200).json(filtered.slice(0, 50));
      }
      collectedEntries.push(...entries);
    }

    if (collectedEntries.length) {
      return res.status(200).json(collectedEntries.slice(0, 50));
    }

    if (fallbackPayload !== null) {
      return res.status(200).json(fallbackPayload);
    }

    if (lastError) {
      const status = lastError.status || 500;
      return res
        .status(status)
        .json({ error: lastError.message || 'Error consultando precios' });
    }

    return res.status(200).json([]);
  } catch (error) {
    const status = error.status || 500;
    return res
      .status(status)
      .json({ error: error.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
