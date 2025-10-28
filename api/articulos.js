// /api/articulos
// Devuelve sugerencias de artículos tomando la lista de precios (Lista=4, Fecha=HOY).
// Soporta ?q= (filtro client-side) y ?limit= (tope de resultados).
// Requiere el mismo login que precios.js

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // Credenciales fijas (usuario con tres erres)
  const username = 'Desarrrollos';
  const password = '1234';

  // ------- Fecha de hoy en Córdoba (YYYY-MM-DD) -------
  const today = new Date().toLocaleDateString('sv-SE', {
    timeZone: 'America/Argentina/Cordoba',
  }); // formato "YYYY-MM-DD"
  const LISTA = '4';

  // ------- Parámetros del cliente -------
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const MAX_HARD_CAP = 5000;
  const userLimit =
    Math.min(parseInt(req.query.limit || '1000', 10) || 1000, MAX_HARD_CAP);

  // ------- Config paginación (por si la API pagina) ------
  // Si la API no pagina, la primera página bastará.
  const PAGE_PARAM = 'page';
  const LIMIT_PARAM = 'limit';
  const API_PAGE_SIZE = 100;

  try {
    // 1) Login
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
    if (!sessionId) {
      return res.status(500).json({ error: 'Login sin sessionId' });
    }

    // 2) Ir a listaPrecios con Lista=4 y Fecha=HOY, acumulando páginas si aplica
    const seen = new Set();
    const collected = [];
    let page = 1;

    while (collected.length < userLimit) {
      const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
      url.searchParams.set('Fecha', today);
      url.searchParams.set('Lista', LISTA);
      // Si el backend ignora estos, no pasa nada; si pagina, los aprovecha.
      url.searchParams.set(PAGE_PARAM, String(page));
      url.searchParams.set(LIMIT_PARAM, String(API_PAGE_SIZE));

      const lpResp = await fetch(url.toString(), { headers: { Cookie: sessionId } });
      if (!lpResp.ok) {
        const txt = await lpResp.text();
        return res
          .status(lpResp.status)
          .json({ error: txt || 'Error consultando lista de precios' });
      }

      const data = await lpResp.json();

      // Posibles formas del payload:
      //  a) { eLPs: [ ... ] }
      //  b) [ { eLPs: [ ... ] }, ... ]
      //  c) [ ... ] ya llano
      let batch = [];
      if (data && Array.isArray(data.eLPs)) {
        batch = data.eLPs;
      } else if (Array.isArray(data)) {
        for (const block of data) {
          if (block && Array.isArray(block.eLPs)) batch.push(...block.eLPs);
        }
        // fallback: si directamente es un array de items ya llanos
        if (!batch.length) batch = data;
      }

      if (!Array.isArray(batch) || !batch.length) break;

      // Normalización → quedarnos con {idArticulo, desArticulo, unidadesBulto}
      for (const it of batch) {
        const id =
          it.idArticulo ??
          it.CodArt ??
          it.codArt ??
          it.id_articulo ??
          it.id ??
          null;

        // Algunos payloads traen descripción con claves distintas
        const desc =
          it.desArticulo ??
          it.Descripcion ??
          it.descripcion ??
          it.DESCRIPCION ??
          '';

        // opcional: unidades por bulto si viene en el payload (útil para UI)
        const uxb =
          it.unidadesBulto ??
          it.UxB ??
          it.uxb ??
          it.Unidades_Bulto ??
          it.unidades_bulto ??
          null;

        if (id != null && !seen.has(id)) {
          seen.add(id);

          // Filtro client-side (si hay q)
          const matches =
            !q ||
            String(id).toLowerCase().includes(q) ||
            String(desc).toLowerCase().includes(q);

          if (matches) {
            collected.push({
              idArticulo: id,
              desArticulo: String(desc || '').trim(),
              unidadesBulto: uxb,
            });
            if (collected.length >= userLimit) break;
          }
        }
      }

      // Heurística de corte si la página vino "incompleta"
      if (batch.length < API_PAGE_SIZE) break;
      page += 1;
    }

    return res.status(200).json(collected.slice(0, userLimit));
  } catch (err) {
    return res
      .status(500)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
