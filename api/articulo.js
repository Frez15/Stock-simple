// /api/articulos
// Devuelve la lista de artículos (autocompletar) con paginación automática.
// Soporta ?q= (filtro client-side) y ?limit= (tope de resultados a devolver).

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Credenciales fijas (usuario con tres erres)
  const username = 'Desarrrollos';
  const password = '1234';

  // -------- Config de paginación --------
  // Si tu API usa 'pagina' en vez de 'page', cambiá PAGE_PARAM = 'pagina'
  const PAGE_PARAM = 'page';
  const LIMIT_PARAM = 'limit';
  const API_PAGE_SIZE = 100;            // la API entrega 100 por página
  const MAX_HARD_CAP = 5000;            // tope de seguridad
  // --------------------------------------

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

    // 2) Parámetros de búsqueda del cliente
    const q = (req.query.q || '').toString().trim();
    const userLimit = Math.min(
      parseInt(req.query.limit || '2000', 10) || 2000,
      MAX_HARD_CAP
    );

    // 3) Traer página por página hasta completar
    let page = 1;
    const seen = new Set();
    const collected = [];

    while (collected.length < userLimit) {
      const url = new URL(`${CHESS_API_BASE}/articulos/`);
      // Algunos backends ignoran LIMIT_PARAM; igual lo mandamos
      url.searchParams.set(PAGE_PARAM, String(page));
      url.searchParams.set(LIMIT_PARAM, String(API_PAGE_SIZE));

      const resp = await fetch(url.toString(), { headers: { Cookie: sessionId } });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(resp.status).json({ error: txt || 'Error consultando artículos' });
      }

      const data = await resp.json();

      // Aplanado: {eArticulos:[...]} o [{eArticulos:[...]},...]
      let batch = [];
      if (data && Array.isArray(data.eArticulos)) {
        batch = data.eArticulos;
      } else if (Array.isArray(data)) {
        for (const block of data) {
          if (block && Array.isArray(block.eArticulos)) batch.push(...block.eArticulos);
        }
      } else if (Array.isArray(data)) {
        batch = data; // por si ya viene como lista llana
      }

      // Sin resultados → cortar
      if (!batch.length) break;

      // Acumular evitando duplicados (por idArticulo)
      for (const it of batch) {
        const id = it.idArticulo ?? it.id_articulo ?? it.id;
        if (id != null && !seen.has(id)) {
          seen.add(id);
          collected.push(it);
          if (collected.length >= userLimit) break;
        }
      }

      // Si la página trajo menos de 100 o no agregó nada nuevo → cortar
      if (batch.length < API_PAGE_SIZE) break;
      page += 1;
    }

    // 4) Filtro client-side (q) por código o descripción
    let filtered = collected;
    if (q) {
      const qNorm = q.toLowerCase();
      filtered = collected.filter((a) => {
        const cod = String(a.idArticulo ?? a.id_articulo ?? '').toLowerCase();
        const desc = String(a.desArticulo ?? a.des_articulo ?? '').toLowerCase();
        return cod.includes(qNorm) || desc.includes(qNorm);
      });
    }

    // 5) Recortar al límite pedido
    res.status(200).json(filtered.slice(0, userLimit));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
