// /api/articulos
// Devuelve la lista de artículos con paginación automática.
// Soporta ?q= (filtro por código/descripcion) y ?limit= (tope a devolver).

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Credenciales (usuario con tres "r")
  const username = 'Desarrrollos';
  const password = '1234';

  // -------- Config --------
  const PAGE_SIZE = 100;          // la API de Chess devuelve 100 por página
  const HARD_CAP  = 5000;         // tope de seguridad
  const q = (req.query.q || '').toString().trim();
  const userLimit = Math.min(
    parseInt(req.query.limit || '2000', 10) || 2000,
    HARD_CAP
  );
  // ------------------------

  try {
    // 1) Login
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: username, password: password }),
    });
    if (!loginResp.ok) {
      return res.status(loginResp.status).json({ error: await loginResp.text() || 'Error de autenticación' });
    }
    const loginData = await loginResp.json();
    const sessionId = loginData.sessionId || loginData.token || loginData.access_token;
    if (!sessionId) {
      return res.status(500).json({ error: 'Login sin sessionId' });
    }

    // 2) Estrategias de paginación a probar en orden
    const strategies = [
      // A) page/limit
      (page) => {
        const url = new URL(`${CHESS_API_BASE}/articulos/`);
        url.searchParams.set('page', String(page));
        url.searchParams.set('limit', String(PAGE_SIZE));
        return url.toString();
      },
      // B) offset/limit
      (page) => {
        const url = new URL(`${CHESS_API_BASE}/articulos/`);
        url.searchParams.set('offset', String((page - 1) * PAGE_SIZE));
        url.searchParams.set('limit', String(PAGE_SIZE));
        return url.toString();
      },
      // C) Desde/Hasta (mayúsculas)
      (page) => {
        const url = new URL(`${CHESS_API_BASE}/articulos/`);
        url.searchParams.set('Desde', String((page - 1) * PAGE_SIZE + 1));
        url.searchParams.set('Hasta', String(page * PAGE_SIZE));
        return url.toString();
      },
      // D) desde/hasta (minúsculas)
      (page) => {
        const url = new URL(`${CHESS_API_BASE}/articulos/`);
        url.searchParams.set('desde', String((page - 1) * PAGE_SIZE + 1));
        url.searchParams.set('hasta', String(page * PAGE_SIZE));
        return url.toString();
      },
    ];

    // 3) Función para leer y aplanar respuesta
    const parseBatch = async (resp) => {
      const data = await resp.json();
      let batch = [];
      if (data && Array.isArray(data.eArticulos)) {
        batch = data.eArticulos;
      } else if (Array.isArray(data)) {
        for (const block of data) {
          if (block && Array.isArray(block.eArticulos)) batch.push(...block.eArticulos);
        }
        // si ya es lista llana de artículos
        if (!batch.length && data.length && data[0]?.idArticulo) batch = data;
      } else if (data && data.idArticulo) {
        batch = [data];
      }
      return batch;
    };

    // 4) Intentar estrategias hasta que alguna devuelva >100 y siguientes páginas
    const collected = [];
    const seen = new Set();

    const fetchAllWithStrategy = async (makeUrl) => {
      let page = 1;
      while (collected.length < userLimit) {
        const url = makeUrl(page);
        const resp = await fetch(url, { headers: { Cookie: sessionId } });
        if (!resp.ok) break; // esta estrategia no sirve

        const batch = await parseBatch(resp);
        if (!batch.length) break;

        for (const it of batch) {
          const id = it.idArticulo ?? it.id_articulo ?? it.id;
          if (id != null && !seen.has(id)) {
            seen.add(id);
            collected.push(it);
            if (collected.length >= userLimit) break;
          }
        }
        if (batch.length < PAGE_SIZE) break; // última página
        page += 1;
      }
      return collected.length;
    };

    let got = 0;
    for (const makeUrl of strategies) {
      const before = collected.length;
      got = await fetchAllWithStrategy(makeUrl);
      if (got > before) break; // esta estrategia funcionó
    }

    // 5) Filtro client-side (?q=)
    let output = collected;
    if (q) {
      const qn = q.toLowerCase();
      output = collected.filter((a) => {
        const cod = String(a.idArticulo ?? a.id_articulo ?? '').toLowerCase();
        const desc = String(a.desArticulo ?? a.des_articulo ?? '').toLowerCase();
        return cod.includes(qn) || desc.includes(qn);
      });
    }

    res.status(200).json(output.slice(0, userLimit));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
