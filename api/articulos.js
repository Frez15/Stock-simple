// /api/articulos - Autocomplete con paginación autodetectada
// Soporta ?q= y ?limit= (tope de resultados).
async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const username = 'Desarrrollos'; // 3 erres
  const password = '1234';

  const API_PAGE_SIZE = 100;
  const MAX_HARD_CAP = 5000;

  try {
    // Login
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      return res
        .status(loginResp.status)
        .json({ error: (await loginResp.text()) || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();
    const sessionId =
      loginData.sessionId || loginData.token || loginData.access_token;
    if (!sessionId) return res.status(500).json({ error: 'Login sin sessionId' });

    // Parámetros
    const q = (req.query.q || '').toString().trim();
    const userLimit = Math.min(
      parseInt(req.query.limit || '2000', 10) || 2000,
      MAX_HARD_CAP
    );

    // Helper para pedir una “página” con params arbitrarios
    const fetchWithParams = async (paramsObj) => {
      const url = new URL(`${CHESS_API_BASE}/articulos/`);
      for (const [k, v] of Object.entries(paramsObj)) url.searchParams.set(k, v);
      const r = await fetch(url.toString(), { headers: { Cookie: sessionId } });
      if (!r.ok) throw new Error((await r.text()) || 'Error consultando artículos');
      const data = await r.json();
      let list = [];
      if (data && Array.isArray(data.eArticulos)) list = data.eArticulos;
      else if (Array.isArray(data)) {
        for (const block of data) {
          if (block && Array.isArray(block.eArticulos)) list.push(...block.eArticulos);
        }
        if (!list.length) list = data; // por si viene plano
      }
      return list;
    };

    // Intento 1: paginación por “page + size”
    const pageKeys = ['page', 'pagina', 'pageIndex', 'pageNumber', 'p'];
    const sizeKeys = ['limit', 'size', 'pageSize', 'cantidad', 'per_page', 'take'];

    let scheme = null; // {type:'page'|'offset', keyPage, keySize|keyOffset}
    let first = [];
    let second = [];

    // probamos combinaciones hasta que la segunda "página" cambie
    outer: for (const pk of pageKeys) {
      for (const sk of sizeKeys) {
        const p1 = await fetchWithParams({ [pk]: '1', [sk]: String(API_PAGE_SIZE) });
        if (!p1.length) continue;
        // pedir "página 2"
        const p2 = await fetchWithParams({ [pk]: '2', [sk]: String(API_PAGE_SIZE) });
        // si la 2da devuelve algo distinto, ya está
        if (p2.length && (p2[0]?.idArticulo ?? p2[0]?.id) !== (p1[0]?.idArticulo ?? p1[0]?.id)) {
          scheme = { type: 'page', keyPage: pk, keySize: sk };
          first = p1; second = p2;
          break outer;
        }
      }
    }

    // Intento 2: paginación por “offset + limit”
    if (!scheme) {
      const offKeys = ['offset', 'start', 'desde', 'desdeId', 'from'];
      for (const ok of offKeys) {
        const p1 = await fetchWithParams({ [ok]: '0', limit: String(API_PAGE_SIZE) });
        if (!p1.length) continue;
        const p2 = await fetchWithParams({
          [ok]: String(API_PAGE_SIZE),
          limit: String(API_PAGE_SIZE),
        });
        if (p2.length && (p2[0]?.idArticulo ?? p2[0]?.id) !== (p1[0]?.idArticulo ?? p1[0]?.id)) {
          scheme = { type: 'offset', keyOffset: ok };
          first = p1; second = p2;
          break;
        }
      }
    }

    // Si no detectamos esquema, devolvemos lo que haya (primer bloque de 100)
    const collected = [];
    const seen = new Set();

    const pushBatch = (batch) => {
      for (const it of batch) {
        const id = it.idArticulo ?? it.id;
        if (id != null && !seen.has(id)) {
          seen.add(id);
          collected.push(it);
          if (collected.length >= userLimit) return true;
        }
      }
      return false;
    };

    if (!scheme) {
      // último recurso: una sola “página” (límite del backend)
      if (!first.length) first = await fetchWithParams({});
      pushBatch(first);
    } else {
      // ya tenemos p1 y p2; seguimos pidiendo
      if (pushBatch(first)) return res.status(200).json(first.slice(0, userLimit));
      if (pushBatch(second)) return res.status(200).json(collected.slice(0, userLimit));

      if (scheme.type === 'page') {
        let page = 3;
        while (collected.length < userLimit) {
          const batch = await fetchWithParams({
            [scheme.keyPage]: String(page),
            [scheme.keySize]: String(API_PAGE_SIZE),
          });
          if (!batch.length) break;
          const hitCap = pushBatch(batch);
          if (batch.length < API_PAGE_SIZE || hitCap) break;
          page += 1;
        }
      } else {
        let offset = API_PAGE_SIZE * 2;
        while (collected.length < userLimit) {
          const batch = await fetchWithParams({
            [scheme.keyOffset]: String(offset),
            limit: String(API_PAGE_SIZE),
          });
          if (!batch.length) break;
          const hitCap = pushBatch(batch);
          if (batch.length < API_PAGE_SIZE || hitCap) break;
          offset += API_PAGE_SIZE;
        }
      }
    }

    // Filtro client-side
    let result = collected;
    if (q) {
      const qn = q.toLowerCase();
      result = collected.filter((a) => {
        const cod = String(a.idArticulo ?? '').toLowerCase();
        const desc = String(a.desArticulo ?? '').toLowerCase();
        return cod.includes(qn) || desc.includes(qn);
      });
    }

    res.status(200).json(result.slice(0, userLimit));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
