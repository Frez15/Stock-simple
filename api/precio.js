// --- LOGIN (tomar cookie del header) ---
const loginResp = await fetch(`${CHESS_API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario: username, password: password }),
});
if (!loginResp.ok) {
  const txt = await loginResp.text();
  return res.status(loginResp.status).json({ error: txt || 'Error de autenticación' });
}

// MUY IMPORTANTE: la sesión viene en Set-Cookie, no en el JSON
// Puede venir en mayúsculas/minúsculas distintas según el proxy:
const setCookie =
  loginResp.headers.get('set-cookie') ||
  loginResp.headers.get('Set-Cookie');
if (!setCookie) {
  return res.status(401).json({ error: 'Login sin Set-Cookie (no llegó JSESSIONID)' });
}
// quedate con la primera cookie y limpiala
const jsession = setCookie.split(',')[0].split(';')[0]; // "JSESSIONID=xxxx"

// --- LISTA DE PRECIOS ---
const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
url.searchParams.append('Fecha', hoy);   // YYYY-MM-DD
url.searchParams.append('Lista', lista); // ej "4"

const priceResp = await fetch(url.toString(), {
  headers: {
    Cookie: jsession,          // <- enviar solo "JSESSIONID=xxxx"
    Accept: 'application/json'
  },
});

const raw = await priceResp.text();      // leé texto primero para depurar
let listData;
try { listData = JSON.parse(raw); } catch {
  return res.status(priceResp.status).json({ error: 'Respuesta no JSON', raw });
}

// Si el backend devolvió un error normalizado (lo que vos viste):
if (listData && typeof listData === 'object' &&
    ('codigo' in listData || 'statusCode' in listData || 'mensaje' in listData)) {
  return res.status(502).json({ error: 'ChessERP respondió error', backend: listData });
}
