// /api/precio.js
// Siempre consulta lista=4 y fecha=hoy (lado servidor) y llama a:
//   /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4&CodArt={id}

function formatTodayISO() {
  const now = new Date(); // hora del servidor
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Extrae "JSESSIONID=..." desde un header Set-Cookie
function extractJSessionFromSetCookie(setCookie) {
  if (!setCookie) return null;
  // Puede venir múltiple; unificamos a string
  const str = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
  const m = str.match(/JSESSIONID=[^;]+/i);
  return m ? m[0] : null;
}

async function handler(req, res) {
  const CHESS_API_BASE = process.env.CHESS_API_BASE ||
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';

  const username = process.env.CHESS_USER || 'Desarrrollos';
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
      body: JSON.stringify({ usuario: username, password: password }),
    });

    if (!loginResp.ok) {
      const text = await loginResp.text();
      return res.status(loginResp.status).json({ error: text || 'Error de autenticación' });
    }

    // Intento 1: leer cookie desde header
    let sessionCookie = extractJSessionFromSetCookie(loginResp.headers.get('set-cookie'));

    // Intento 2: si no hay Set-Cookie, probar con el JSON
    let loginData = {};
    try { loginData = await loginResp.json(); } catch (_) {}
    if (!sessionCookie) {
      let sid = loginData.sessionId || loginData.token || loginData.access_token;
      if (!sid) {
        return res.status(500).json({ error: 'No se recibió sessionId (ni Set-Cookie) en el login' });
      }
      if (!/^JSESSIONID=/i.test(String(sid))) sid = `JSESSIONID=${sid}`;
      sessionCookie = sid;
    }

    // 2) Build URL EXACTA hacia Chess
    // Debe ser: /listaPrecios/?Fecha=YYYY-MM-DD&Lista=4&CodArt=...
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
      const text = await priceResp.text();
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
