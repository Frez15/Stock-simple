// /api/articulos.js
// Autocomplete de artículos: login -> GET /articulos/ -> extrae robusto -> filtra por ?q= y limita por ?limit=.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Credenciales fijas (tres erres)
  const username = 'Desarrrollos';
  const password = '1234';

const q = (req.query.q || '').toString().trim();
const limit = Math.min(parseInt(req.query.limit || '2000', 10) || 2000, 2000);

  try {
    // 1) Login
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
      return res
        .status(500)
        .json({ error: 'Login OK pero sin sessionId en la respuesta' });
    }

    // 2) Artículos (sin filtros del lado de Chess)
    const artResp = await fetch(`${CHESS_API_BASE}/articulos/`, {
      method: 'GET',
      headers: {
        Cookie: sessionId,            // ej: "JSESSIONID=...."
        Accept: 'application/json',
      },
    });

    if (!artResp.ok) {
      const text = await artResp.text();
      return res
        .status(artResp.status)
        .json({ error: text || 'Error consultando artículos' });
    }

    const artData = await artResp.json();

    // 3) Extractor ultra-robusto: encuentra arrays de artículos en cualquier nivel
    const extractArticles = (data) => {
      const out = [];

      const isArticleArray = (arr) =>
        Array.isArray(arr) &&
        arr.length > 0 &&
        typeof arr[0] === 'object' &&
        arr[0] !== null &&
        ('idArticulo' in arr[0] || 'desArticulo' in arr[0]);

      const walk = (node) => {
        if (!node) return;
        if (isArticleArray(node)) {
          out.push(...node);
          return;
        }
        if (Array.isArray(node)) {
          for (const item of node) walk(item);
          return;
        }
        if (typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) {
            // pista por nombre de clave
            if (
              k.toLowerCase().includes('articulos') ||
              k.toLowerCase().includes('earticulos')
            ) {
              if (isArticleArray(v)) {
                out.push(...v);
              } else {
                walk(v);
              }
            } else {
              walk(v);
            }
          }
        }
      };

      walk(data);
      return out;
    };

    let all = extractArticles(artData);

    // Si sigue vacío, devolvemos un diagnóstico mínimo para ver qué vino
    if (!Array.isArray(all) || all.length === 0) {
      return res.status(200).json({
        items: [],
        diagnostic: {
          note:
            'No se detectaron arrays de artículos en la respuesta. Te muestro una muestra del JSON para inspección.',
          sample: JSON.stringify(artData, null, 2)?.slice(0, 2000),
        },
      });
    }

    // 4) Map a campos mínimos
    const minimal = all.map((a) => ({
      idArticulo: a.idArticulo,
      desArticulo: a.desArticulo,
      unidadesBulto: a.unidadesBulto ?? null,
      pesable: !!a.pesable,
      codBarraUnidad: a.codBarraUnidad || '',
    }));

    // 5) Filtro backend
    let result = minimal;
    if (q) {
      const norm = (s) =>
        (s || '')
          .toString()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
      const nq = norm(q);

      result = minimal.filter((item) => {
        const byDesc = norm(item.desArticulo).includes(nq);
        const byId = item.idArticulo?.toString().includes(q);
        const byEan = item.codBarraUnidad?.toString().includes(q);
        return byDesc || byId || byEan;
      });
    }

    // 6) Limitar
    result = result.slice(0, limit);

    // Para el datalist te conviene devolver solo el array plano:
    return res.status(200).json(result);
  } catch (err) {
    return res
      .status(500)
      .json({ error: err?.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
