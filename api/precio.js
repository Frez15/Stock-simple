// === helpers robustos ===
function normalize(str) {
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // saca tildes
    .replace(/[.\-_/]/g, "")                          // saca signos comunes
    .toLowerCase().trim();
}
function normalizeKey(str) {
  return normalize(str).replace(/\s+/g, "");          // saca espacios para claves
}
function normalizeId(val) {
  // Dejamos solo dígitos; si no hay dígitos, comparamos como string normalizado
  const digits = String(val).match(/\d+/g)?.join("") ?? "";
  return digits || normalize(val);
}

// Incluí variantes frecuentes en español
const ARTICLE_ID_KEYS = [
  'idarticulo',
  'idArticulo',
  'articulo',
  'Artículo',                // con tilde
  'codigo',                  // a veces viene así
  'codigoarticulo',
  'códigoartículo',          // con tildes
  'cod.articulo',
  'cod articulo',
  'id'
];

function pickField(object, keys) {
  if (!object || typeof object !== 'object') return undefined;
  const entries = Object.entries(object).filter(([_, v]) => v !== undefined && v !== null);

  // 1) match exacto (ignorando tildes, mayúsculas, espacios y signos)
  for (const [candidate, value] of entries) {
    const ck = normalizeKey(candidate);
    for (const k of keys) {
      if (ck === normalizeKey(k)) return value;
    }
  }
  // 2) match parcial (por si viene "Código de Artículo")
  for (const [candidate, value] of entries) {
    const ck = normalizeKey(candidate);
    for (const k of keys) {
      if (ck.includes(normalizeKey(k))) return value;
    }
  }
  return undefined;
}

function unwrapPriceEntries(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(v => v != null);

  if (typeof payload !== 'object') return [];

  const PRICE_CONTAINER_KEYS = [
    'precios','lista','items','detalle','articulos','data',
    'resultado','resultados','articulo','rows','records'
  ];

  // busca por contenedores conocidos
  for (const key of PRICE_CONTAINER_KEYS) {
    const candidate = pickField(payload, [key]);
    if (candidate !== undefined) {
      const nested = unwrapPriceEntries(candidate);
      if (nested.length) return nested;
    }
  }
  // sino, recorre todo el objeto
  for (const value of Object.values(payload)) {
    const nested = unwrapPriceEntries(value);
    if (nested.length) return nested;
  }
  return [];
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
  const lista = list || '4';
  const hoy = date || new Date().toISOString().split('T')[0];

  try {
    // --- LOGIN ---
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      return res.status(loginResp.status).json({ error: await loginResp.text() || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();

    // Sanitiza cookie: quedate solo con "JSESSIONID=xyz"
    const rawCookie =
      loginData.sessionId || loginData.token || loginData.access_token || '';
    const cookie = String(rawCookie).split(';')[0]; // <- importante

    // --- LISTA DE PRECIOS ---
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.append('Fecha', hoy);
    url.searchParams.append('Lista', lista);

    const priceResp = await fetch(url.toString(), {
      headers: {
        Cookie: cookie,
        accept: 'application/json',
      },
    });
    if (!priceResp.ok) {
      return res.status(priceResp.status).json({ error: await priceResp.text() || 'Error consultando precios' });
    }

    const listData = await priceResp.json();
    let entries = unwrapPriceEntries(listData);
    if (!entries.length && listData && typeof listData === 'object') {
      // a veces devuelve un objeto único
      entries = [listData];
    }

    const needle = normalizeId(id); // "142" => "142", "000142" => "142"

    const results = entries.filter((item) => {
      if (!item || typeof item !== 'object') return false;

      // intentá primero con las claves declaradas
      let candidateId = pickField(item, ARTICLE_ID_KEYS);

      // si no encontró, probá campos compuestos típicos como "Código de Artículo"
      if (candidateId == null) {
        candidateId = pickField(item, [
          'Código de Artículo',
          'Codigo de Articulo',
          'Código',
          'Codigo',
        ]);
      }
      if (candidateId == null) return false;

      return normalizeId(candidateId) === needle;
    });

    // DEBUG opcional (borrá en producción): si no hay resultados, devolvé claves para inspección
    if (!results.length) {
      const sample = Array.isArray(entries) && entries.length ? entries[0] : listData;
      return res.status(200).json({
        results: [],
        hint: 'Sin coincidencias. Revisá normalización y nombre de campos.',
        sampleKeys: sample && typeof sample === 'object' ? Object.keys(sample) : null
      });
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;

