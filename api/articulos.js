// /api/articulos.js
// Trae artículos desde ChessERP y filtra en el backend por ?q= y ?limit=.
// Devuelve campos mínimos para autocompletar.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Credenciales fijas (como venías usando)
  const username = 'Desarrrollos'; // con tres "r"
  const password = '1234';

  // Parámetros de búsqueda y límite
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 100);

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
      return res
        .status(500)
        .json({ error: 'Login OK pero sin sessionId en la respuesta' });
    }

    // 2) Traer artículos (sin filtros del lado Chess para evitar vacíos)
    const artResp = await fetch(`${CHESS_API_BASE}/articulos/`, {
      headers: { Cookie: sessionId },
    });

    if (!artResp.ok) {
      const text = await artResp.text();
      return res
        .status(artResp.status)
        .json({ error: text || 'Error consultando artículos' });
    }

    const artData = await artResp.json();

    // 3) Normalizar estructura (a veces viene { eArticulos: [...] }, otras un array de bloques)
    let all = [];
    if (artData && Array.isArray(artData.eArticulos)) {
      all = artData.eArticulos;
    } else if (Array.isArray(artData)) {
      for (const block of artData) {
        if (block && Array.isArray(block.eArticulos)) {
          all.push(...block.eArticulos);
        }
      }
    } else {
      // fallback por si viniera directamente como array de artículos
      if (Array.isArray(artData)) all = artData;
    }

    // 4) Mapear a campos mínimos para el autocompletado
    const minimal = all.map(a => ({
      idArticulo: a.idArticulo,
      desArticulo: a.desArticulo,
      unidadesBulto: a.unidadesBulto ?? null,
      pesable: !!a.pesable,
      codBarraUnidad: a.codBarraUnidad || '',
    }));

    // 5) Filtro backend (case-insensitive, acentos básicos y por código)
    let result = minimal;
    if (q) {
      const norm = s =>
        (s || '')
          .toString()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

      const nq = norm(q);
      result = minimal.filter(item => {
        const byDesc = norm(item.desArticulo).includes(nq);
        const byId = item.idArticulo?.toString().includes(q);
        const byEan = item.codBarraUnidad?.toString().includes(q);
        return byDesc || byId || byEan;
      });
    }

    // 6) Limitar
    result = result.slice(0, limit);

    return res.status(200).json(result);
  } catch (err) {
    return res
      .status(500)
      .json({ error: err?.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
