// Serverless: /api/precio?id=123&list=4&date=YYYY-MM-DD
async function handler(req, res) {
  const CHESS_API_BASE = 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  const username = process.env.CHESS_USER || 'Desarrrollos';
  const password = process.env.CHESS_PASSWORD || '1234';

  const { id, list, date } = req.query;
  if (!id) return res.status(400).json({ error: 'Falta el parámetro id' });

  const lista = list || '4';
  const hoy = date || new Date().toISOString().split('T')[0];

  // helpers
  const normalize = (s) =>
    String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const normalizeKey = (s) => normalize(s).replace(/\s+|[.\-_/]/g, '');
  const normalizeId = (v) => (String(v).match(/\d+/g)?.join('') ?? normalize(v));
  const ARTICLE_ID_KEYS = [
    'idarticulo','idArticulo','articulo','Artículo',
    'codigo','Código','codigoarticulo','Código de Artículo','Codigo de Articulo','id'
  ];

  const pickField = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return undefined;
    const entries = Object.entries(obj).filter(([_, v]) => v != null);
    // exacto
    for (const [k, v] of entries) for (const key of keys)
      if (normalizeKey(k) === normalizeKey(key)) return v;
    // parcial (ej: "Código de Artículo")
    for (const [k, v] of entries) for (const key of keys)
      if (normalizeKey(k).includes(normalizeKey(key))) return v;
    return undefined;
  };

  const unwrap = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload.filter((x) => x != null);
    if (typeof payload !== 'object') return [];
    const CONTAINERS = ['precios','lista','items','detalle','articulos','data','resultado','resultados','rows','records'];
    for (const c of CONTAINERS) {
      const found = pickField(payload, [c]);
      const nested = unwrap(found);
      if (nested.length) return nested;
    }
    // recorrer valores por si viene más hondo
    for (const v of Object.values(payload)) {
      const nested = unwrap(v);
      if (nested.length) return nested;
    }
    return [];
  };

  try {
    // ---- LOGIN: tomar cookie del header ----
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      const text = await loginResp.text();
      return res.status(loginResp.status).json({ error: text || 'Error de autenticación' });
    }

    const setCookie = loginResp.headers.get('set-cookie') || loginResp.headers.get('Set-Cookie');
    if (!setCookie) {
      return res.status(401).json({ error: 'Login sin Set-Cookie; no llegó JSESSIONID' });
    }
    // usar SOLO la primera cookie y SOLO el par clave=valor
    const jsession = setCookie.split(',')[0].split(';')[0]; // "JSESSIONID=xxxx"

    // ---- LISTA DE PRECIOS ----
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.append('Fecha', hoy);
    url.searchParams.append('Lista', lista);

    const priceResp = await fetch(url.toString(), {
      headers: {
        Cookie: jsession,                // ← cookie real del header
        Accept: 'application/json',
      },
    });

    const raw = await priceResp.text();  // para poder devolver debug si no es JSON
    let listData;
    try { listData = JSON.parse(raw); } catch {
      return res.status(priceResp.status).json({ error: 'Respuesta no JSON', raw });
    }

    // si el backend devolvió sobre de error, mostralo
    if (listData && typeof listData === 'object' &&
        ('codigo' in listData || 'statusCode' in listData || 'mensaje' in listData)) {
      return res.status(502).json({ error: 'ChessERP respondió error', backend: listData });
    }

    let entries = unwrap(listData);
    if (!entries.length && listData && typeof listData === 'object') entries = [listData];

    const needle = normalizeId(id);
    const results = entries.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      let candidate = pickField(item, ARTICLE_ID_KEYS);
      if (candidate == null) candidate = pickField(item, ['Código de Artículo','Codigo de Articulo','Código','Codigo']);
      if (candidate == null) return false;
      return normalizeId(candidate) === needle;
    });

    if (!results.length) {
      const sample = Array.isArray(entries) && entries.length ? entries[0] : listData;
      return res.status(200).json({ results: [], hint: 'Sin coincidencias', sampleKeys: sample ? Object.keys(sample) : null });
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
