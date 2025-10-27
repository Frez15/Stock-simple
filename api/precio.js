// Serverless function to obtain price information for an article from ChessERP.
// It authenticates for every request and queries the `/listaPrecios/` endpoint.

async function handler(req, res) {
  const CHESS_API_BASE =
    'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
  // Use the same credentials as the rest of the API functions. They can be
  // overridden via environment variables (e.g. CHESS_PRICE_USERNAME) so the
  // deployment can supply an account with permisos sobre lista de precios.
  const username =
    process.env.CHESS_PRICE_USERNAME ||
    process.env.CHESS_USERNAME ||
    'Desarrrollos';
  const password =
    process.env.CHESS_PRICE_PASSWORD ||
    process.env.CHESS_PASSWORD ||
    '1234';
  const { id, lista, fecha } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Falta el parámetro id' });
  }
  if (!username || !password) {
    return res
      .status(500)
      .json({ error: 'Credenciales de ChessERP no configuradas en el servidor' });
  }

  const targetList = lista || 4;
  const targetDate = fecha || new Date().toISOString().slice(0, 10);

  try {
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
    let loginData = null;
    try {
      loginData = await loginResp.json();
    } catch (jsonErr) {
      // The ChessERP auth endpoint sometimes answers with an empty body while
      // still setting the session cookie. We swallow JSON parse errors and rely
      // on the headers in that case.
      loginData = null;
    }

    let sessionId =
      (loginData &&
        (loginData.sessionId || loginData.token || loginData.access_token)) ||
      null;

    if (!sessionId) {
      // Node's fetch implementation (undici) exposes `getSetCookie`, but on
      // some runtimes only `get('set-cookie')` is available. We try both to
      // retrieve the authentication cookie.
      let cookies = [];
      if (typeof loginResp.headers.getSetCookie === 'function') {
        cookies = loginResp.headers.getSetCookie();
      } else {
        const rawCookie = loginResp.headers.get('set-cookie');
        if (rawCookie) {
          cookies = rawCookie.split(/,(?=\s*[^;]+?=)/);
        }
      }

      for (const cookie of cookies) {
        if (!cookie) continue;
        const trimmed = cookie.trim();
        // The backend expects the cookie name/value pair without attributes
        // (path, HttpOnly, etc.), so we keep only the first segment.
        const baseCookie = trimmed.split(';')[0];
        if (/session/i.test(baseCookie.split('=')[0])) {
          sessionId = baseCookie;
          break;
        }
      }

      if (!sessionId && cookies.length) {
        const fallback = cookies[0].trim().split(';')[0];
        if (fallback) {
          sessionId = fallback;
        }
      }
    }

    if (!sessionId) {
      return res
        .status(502)
        .json({ error: 'No se obtuvo sessionId al autenticar con ChessERP' });
    }

    const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
    url.searchParams.append('Fecha', targetDate);
    url.searchParams.append('Lista', targetList);
    url.searchParams.append('CodArt', id);

    const priceResp = await fetch(url.toString(), {
      // IMPORTANT: The API expects the cookie exactly as it is returned by the
      // login service (e.g. `JSESSIONID=abcd`). The login response already
      // includes the cookie name, so we forward it without altering it.
      headers: { Cookie: sessionId },
    });
    if (!priceResp.ok) {
      const text = await priceResp.text();
      return res
        .status(priceResp.status)
        .json({ error: text || 'Error consultando precio' });
    }
    const priceData = await priceResp.json();

    if (priceData && Array.isArray(priceData.error) && priceData.error.length) {
      const message = priceData.error
        .map((item) => item && item.mensaje)
        .filter(Boolean)
        .join(' ');
      const lowered = (message || '').toLowerCase();
      const status = lowered.includes('no cuenta con acceso') ? 403 : 502;
      return res.status(status).json({ error: message || 'Error consultando precio' });
    }

    let result = priceData;
    if (priceData && typeof priceData === 'object') {
      const dsPrice = priceData.dsListaPreciosApi || priceData.dslistaPreciosApi;
      if (dsPrice && Array.isArray(dsPrice.listaPrecios) && dsPrice.listaPrecios.length) {
        result = dsPrice.listaPrecios[0];
      } else if (Array.isArray(priceData.listaPrecios) && priceData.listaPrecios.length) {
        result = priceData.listaPrecios[0];
      } else if (Array.isArray(priceData)) {
        result = priceData[0];
      }
    }

    res.status(200).json(result || {});
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || 'Error conectando con ChessERP' });
  }
}

module.exports = handler;
