// Devuelve artículos para autocompletar (filtrados por ?q= y con paginado).
// Reutiliza /api/login para obtener la cookie.
// Intenta paginar con varios esquemas: (Desde,Cantidad) | (Desde,Hasta) | (page,size)

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

async function getSessionCookie(req) {
  const resp = await fetch(`${baseUrl(req)}/api/login`, { headers: { Accept: 'application/json' }});
  if (!resp.ok) throw new Error(`Fallo /api/login (${resp.status})`);
  const data = await resp.json();
  let sid = data.sessionId || data.token || data.access_token || data.JSESSIONID || data.jsessionid;
  if (!sid) throw new Error('Login no devolvió sessionId');
  if (!/^JSESSIONID=/i.test(String(sid))) sid = `JSESSIONID=${sid}`;
  return sid;
}

const CHESS_API_BASE =
  process.env.CHESS_API_BASE ||
  'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

// Intenta una “página” con un esquema de query dado
async function fetchBatch({ cookie, scheme, start, size }) {
  const url = new URL(`${CHESS_API_BASE}/articulos/`);
  url.searchParams.set('Anulado', 'false');

  if (scheme === 'desde-cantidad') {
    url.searchParams.set('Desde', String(start));
    url.searchParams.set('Cantidad', String(size));
  } else if (scheme === 'desde-hasta') {
    url.searchParams.set('Desde', String(start));
    url.searchParams.set('Hasta', String(start + size));
  } else if (scheme === 'page-size') {
    url.searchParams.set('page', String(Math.floor(start / size)));
    url.searchParams.set('size', String(size));
  }

  const resp = await fetch(url.toString(), {
    headers: { Cookie: cookie, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(t || `Error consultando artículos (${resp.status})`);
  }
  const data = await resp.json().catch(() => ({}));
  // Normalizador: el Chess suele devolver eArticulos adentro de dsArticulosApi
  let list = [];
  if (Array.isArray(data?.dsArticulosApi?.eArticulos)) list = data.dsArticulosApi.eArticulos;
  else if (Array.isArray(data?.eArticulos)) list = data.eArticulos;
  else if (Array.isArray(data)) {
    for (const b of data) {
      if (Array.isArray(b?.dsArticulosApi?.eArticulos)) list.push(...b.dsArticulosApi.eArticulos);
      else if (Array.isArray(b?.eArticulos)) list.push(...b.eArticulos);
    }
  }
  // Fallback: algunos tenants responden directamente como array de artículos (como tu ejemplo)
  if (!list.length && Array.isArray(data) && data.length && data[0]?.idArticulo) list = data;

  return list;
}

async function fetchAllArticles(cookie, maxWanted = 2000, batch = 500) {
  const schemes = ['desde-cantidad', 'desde-hasta', 'page-size', '']; // '' = sin paginar (un único llamado)
  const seen = new Map();

  for (const scheme of schemes) {
    let start = 0;
    let loops = 0;
    // Limpio entre esquemas
    for (const key of seen.keys()) seen.delete(key);

    while (loops < 50) {
      let page;
      if (scheme) {
        page = await fetchBatch({ cookie, scheme, start, size: batch });
      } else {
        // Sin paginar: un solo request
        page = await fetchBatch({ cookie, scheme: 'desde-cantidad', start: 0, size: batch }); // usamos normalizador
      }

      for (const a of page || []) {
        const id = a?.idArticulo ?? a?.id_articulo;
        if (id != null && !seen.has(id)) seen.set(id, a);
      }

      if (!scheme) break; // modo sin paginado: salir
      if (!page || page.length === 0 || page.length < batch || seen.size >= maxWanted) break;

      start += batch;
      loops += 1;
    }

    if (seen.size > 0) break; // si este esquema funcionó, listo
  }

  return Array.from(seen.values());
}

function matchText(a, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const id = String(a?.idArticulo ?? '').toLowerCase();
  const name = String(a?.desArticulo ?? '').toLowerCase();
  const codeBar = String(a?.codBarraUnidad ?? a?.codBarraBulto ?? '').toLowerCase();
  return id.includes(s) || name.includes(s) || codeBar.includes(s);
}

module.exports = async function handler(req, res) {
  try {
    const q = (req.query.q || '').toString();
    const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 100);
    const cookie = await getSessionCookie(req);

    // Traemos varias “páginas” hasta tener un buen universo para buscar
    const all = await fetchAllArticles(cookie, 10000, 500);

    // Filtrado por texto en el servidor (rápido y evita bajar TODO cada vez)
    const filtered = (all || []).filter(a => !a?.anulado && matchText(a, q));

    // Orden simple: primero coincidencia en inicio de nombre, luego por id
    filtered.sort((a, b) => {
      const an = (a.desArticulo || '').toLowerCase();
      const bn = (b.desArticulo || '').toLowerCase();
      const s  = q.toLowerCase();
      const aStarts = an.startsWith(s) ? 0 : 1;
      const bStarts = bn.startsWith(s) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return (a.idArticulo || 0) - (b.idArticulo || 0);
    });

    res.status(200).json(filtered.slice(0, limit));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
};
