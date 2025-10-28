// /api/articulos.js
// Sugerencias de artículos para autocompletar.
// - Usa /api/login para obtener el JSESSIONID (igual que precio.js).
// - Pagina contra /articulos/ (100 por página).
// - Soporta ?q= (filtro client-side) y ?limit= (default 1000; hardcap 5000).

function buildSelfBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const host  = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

async function getSessionCookieViaLocalLogin(req) {
  const base = buildSelfBaseUrl(req);
  const loginUrl = `${base}/api/login`;
  const resp = await fetch(loginUrl, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `Fallo /api/login (${resp.status})`);
  }
  const data = await resp.json();

  let sid = data.sessionId || data.token || data.access_token || data.JSESSIONID || data.jsessionid;
  if (!sid) throw new Error('Login no devolvió sessionId');

  // Asegurar prefijo de cookie
  if (!/^JSESSIONID=/i.test(String(sid))) sid = `JSESSIONID=${sid}`;
  return sid; // para header Cookie
}

async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE
    || 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const q = (req.query.q || '').toString().trim().toLowerCase();
  const MAX_HARD_CAP = 5000;
  const userLimit = Math.min(parseInt(req.query.limit || '1000', 10) || 1000, MAX_HARD_CAP);

  // Params de paginado que vimos que Chess respeta
  const PAGE_PARAM  = 'page';
  const LIMIT_PARAM = 'limit';
  const API_PAGE_SZ = 100;

  try {
    // 1) Obtener cookie de sesión usando el mismo flujo que precio.js
    const sessionCookie = await getSessionCookieViaLocalLogin(req);

    // 2) Traer artículos paginando
    const seen = new Set();
    const collected = [];
    let page = 1;

    while (collected.length < userLimit) {
      const url = new URL(`${CHESS_API_BASE}/articulos/`);
      url.searchParams.set(PAGE_PARAM, String(page));
      url.searchParams.set(LIMIT_PARAM, String(API_PAGE_SZ));

      const resp = await fetch(url.toString(), {
        headers: {
          'Cookie': sessionCookie,
          'Accept': 'application/json'
        }
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        return res.status(resp.status).json({ error: txt || 'Error consultando artículos' });
      }

      const data = await resp.json().catch(() => ({}));

      // Posibles formas:
      //  a) { eArticulos: [...] }
      //  b) [ { eArticulos: [...] }, ... ]
      //  c) [ ... ] llano
      let batch = [];
      if (data && Array.isArray(data.eArticulos)) {
        batch = data.eArticulos;
      } else if (Array.isArray(data)) {
        const tmp = [];
        for (const block of data) {
          if (block && Array.isArray(block.eArticulos)) tmp.push(...block.eArticulos);
        }
        batch = tmp.length ? tmp : data;
      } else if (Array.isArray(data)) {
        batch = data;
      }

      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const it of batch) {
        const id  = it.idArticulo ?? it.id_articulo ?? it.CodArt ?? it.codArt ?? it.id ?? null;
        const des = it.desArticulo ?? it.des_articulo ?? it.descripcion ?? it.DESCRIPCION ?? '';

        if (id != null && !seen.has(id)) {
          // Filtro client-side
          const matches = !q ||
            String(id).toLowerCase().includes(q) ||
            String(des).toLowerCase().includes(q);

          if (matches) {
            seen.add(id);
            collected.push({
              idArticulo: id,
              desArticulo: String(des || '').trim(),
              // extras útiles si vienen en el payload
              unidadesBulto: it.unidadesBulto ?? it.UxB ?? it.uxb ?? null,
              pesable: it.Pesable ?? it.pesable ?? it.es_pesable ?? null,
              minimoVenta: it.minimoVenta ?? it.MinimoVenta ?? it.minimo_venta ?? null,
            });
            if (collected.length >= userLimit) break;
          }
        }
      }

      // Si la página vino “corta”, no hay más
      if (batch.length < API_PAGE_SZ) break;
      page += 1;
    }

    return res.status(200).json(collected.slice(0, userLimit));
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
