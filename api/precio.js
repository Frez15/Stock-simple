// /api/precio.js
// Siempre consulta lista=4 y fecha=hoy (lado servidor) con:
//   /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4&CodArt={id}

function formatTodayISO() {
  const now = new Date(); // hora del servidor
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Intenta extraer "JSESSIONID=..." desde distintas fuentes
function pickJSessionFromHeaders(resp) {
  // Vercel/undici soporta getSetCookie()
  const getSetCookie = resp.headers?.getSetCookie?.();
  if (Array.isArray(getSetCookie) && getSetCookie.length) {
    const joined = getSetCookie.join('; ');
    const m = joined.match(/JSESSIONID=[^;]+/i);
    if (m) return m[0];
  }
  // fallback: get('set-cookie') (algunas plataformas colapsan en una sola)
  const sc = resp.headers?.get?.('set-cookie');
  if (sc) {
    const m = String(sc).match(/JSESSIONID=[^;]+/i);
    if (m) return m[0];
  }
  return null;
}

function pickJSessionFromJson(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // chequeos directos comunes
  const direct = obj.sessionId || obj.token || obj.access_token || obj.JSESSIONID || obj.jsessionid || obj.cookie;
  if (direct) return String(direct);

  // rutas anidadas típicas
  const candidates = [
    ['data','sessionId'], ['data','token'], ['data','access_token'], ['data','JSESSIONID'],
    ['result','sessionId'], ['result','token'], ['result','JSESSIONID'],
    ['sess','sessionId'], ['sess','JSESSIONID'],
  ];
  for (const path of candidates) {
    let cur = obj;
    for (const key of path) {
      cur = cur?.[key];
    }
    if (cur) return String(cur);
  }
  return null;
}

async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  // OJO con mayúsculas del usuario: soporte dijo que es case-sensitive
  const username = process.env.CHESS_USER || 'Desarrrollos'; // “Desarrrollos” (tres erres), como venías usando
  const password = process.env.CHESS_PASSWORD || '1234';
  if (!username || !password) {
    return res.status(500).json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
    }

  const codArt = (req.query.id ?? '').toString().trim();
  if (!codArt) {
    return res.status(400).json({ error: 'Falta parámetro id (CodArt)' });
  }

  const lista = '4';
  const fecha = formatTodayISO();

  try {
    // 1) Login
    const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // OJO: el backend pide {usuario, password} (no {username})
      body: JSON.stringify({ usuario: username, password: password }),
      redirect: 'manual', // por si hace 302 con Set-Cookie
    });

    if (!loginResp.ok && loginResp.status !== 302) {
      const text = await loginResp.text().catch(() => '');
      return res.status(loginResp.status).json({ error: text || 'Error de autenticación' });
    }

    // A) Intentar Set-Cookie → JSESSIONID
    let sessionCookie = pickJSessionFromHeaders(loginResp);

    // B) Intentar leer JSON y buscar sessionId en múltiples rutas
    //    (si el endpoint respondió 302 puede no haber body; capturamos error)
    let loginJson = {};
    try { loginJson = await loginResp.json(); } catch (_) {}
    if (!sessionCookie) {
      let sid = pickJSessionFromJson(loginJson);
      if (sid) {
        if (!/^JSESSIONID=/i.test(sid)) sid = `JSESSIONID=${sid}`;
        sessionCookie = sid;
      }
    }

    if (!sessionCookie) {
      // Debug amigable: qué claves llegaron en loginJson
      const keys = loginJson && typeof loginJson === 'object' ? Object.keys(loginJson) : [];
      return res.status(500).json({
        error: 'No se recibió sessionId (ni Set-Cookie) en el login',
        detail: { jsonKeys: keys }
      });
    }

    // 2) Build URL EXACTA hacia Chess
    //    /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4&CodArt=...
    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.set('Fecha', fecha);  // mayúsculas exactas
    url.searchParams.set('Lista', lista);
    url.searchParams.set('CodArt', codArt);

    // 3) GET precios
    const priceResp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'Accept': 'application/json'
      },
    });

    if (!priceResp.ok) {
      const text = await priceResp.text().catch(() => '');
      return res.status(priceResp.status).json({ error: text || 'Error consultando precios' });
    }

    const data = await priceResp.json().catch(() => ({}));
    const list = Array.isArray(data) ? data : [data];
    return res.status(200).json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
