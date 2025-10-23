// Configuración
const CHESS_API_BASE = 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
// Credenciales de acceso a ChessERP. Si despliegas en Vercel, es preferible definir
// estas variables como variables de entorno; sin embargo, a solicitud del usuario
// se incluyen directamente aquí. ¡Ten en cuenta que exponer credenciales en el
// código público puede ser un riesgo de seguridad!
const CHESS_USER = 'admin'; // Usuario de ChessERP
const CHESS_PASSWORD = 'Elplaneta1551'; // Contraseña de ChessERP
const ID_DEPOSITO = 1; // Depósito desde el cual consultar el stock

// Variables de estado para reutilizar el token de autenticación y la lista
// completa de artículos. De este modo evitamos iniciar sesión y descargar
// todos los artículos en cada búsqueda.
let authToken = null;
let articlesList = null;

/**
 * Obtiene y almacena un token de autenticación reutilizable. Si ya existe un
 * token previamente obtenido lo reutiliza, de lo contrario llama a login().
 */
async function ensureAuth() {
  if (!authToken) {
    authToken = await login();
  }
  return authToken;
}

/**
 * Descarga la lista completa de artículos para su uso en las sugerencias.
 * Este método se ejecuta una sola vez; los resultados se almacenan en
 * articlesList. En caso de error lanza una excepción.
 */
async function loadAllArticles() {
  if (articlesList) {
    return;
  }
  const token = await ensureAuth();
  const url = new URL(`${CHESS_API_BASE}/articulos/`);
  // No pasamos parámetros para que devuelva todos los artículos no anulados por defecto.
  const response = await fetch(url, {
    headers: { 'Cookie': `JSESSIONID=${token}` }
  });
  if (!response.ok) {
    throw new Error('Error al obtener artículos');
  }
  const data = await response.json();
  // Algunos endpoints devuelven objetos o listas; normalizamos a lista.
  articlesList = Array.isArray(data) ? data : [data];
}

/**
 * Realiza el inicio de sesión contra ChessERP. Este servicio devuelve un
 * objeto con la propiedad `sessionId`. Según la documentación de ChessERP,
 * las llamadas posteriores deben incluir el identificador de sesión en un
 * header llamado `Cookie` con el formato `JSESSIONID={sessionId}`.
 */
async function login() {
  const response = await fetch(`${CHESS_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // La API espera los campos "usuario" y "password" en el cuerpo
    body: JSON.stringify({ usuario: CHESS_USER, password: CHESS_PASSWORD })
  });
  if (!response.ok) {
    throw new Error('Error al autenticar');
  }
  const data = await response.json();
  // El campo sessionId contiene el identificador de sesión
  return data.sessionId || data.token || data.access_token;
}

async function fetchStock(articleId, token) {
  const url = new URL(`${CHESS_API_BASE}/stock/`);
  url.searchParams.append('idDeposito', ID_DEPOSITO);
  url.searchParams.append('idArticulo', articleId);
  const response = await fetch(url, {
    // Incluir cookie con JSESSIONID según especificaciones de autenticación
    headers: { 'Cookie': `JSESSIONID=${token}` }
  });
  if (!response.ok) {
    throw new Error('Error consultando stock');
  }
  return response.json();
}

async function fetchArticle(articleId, token) {
  const url = new URL(`${CHESS_API_BASE}/articulos/`);
  url.searchParams.append('articulo', articleId);
  const response = await fetch(url, {
    headers: { 'Cookie': `JSESSIONID=${token}` }
  });
  if (!response.ok) {
    throw new Error('Error consultando artículo');
  }
  return response.json();
}

async function fetchPrice(articleId, token) {
  const url = new URL(`${CHESS_API_BASE}/listaPrecios/`);
  url.searchParams.append('articulo', articleId);
  // Puedes especificar una fecha de vigencia si lo deseas
  const response = await fetch(url, {
    headers: { 'Cookie': `JSESSIONID=${token}` }
  });
  if (!response.ok) {
    throw new Error('Error consultando precios');
  }
  return response.json();
}

function renderResult(data) {
  const resultDiv = document.getElementById('result');
  if (!data) {
    resultDiv.style.display = 'none';
    return;
  }
  const { article, price, stock } = data;
  resultDiv.innerHTML = `
    <h3>${article.desarticulo || 'Artículo sin descripción'}</h3>
    <p><strong>Unidades por bulto:</strong> ${article.unidadesBulto ?? 'N/D'}</p>
    <p><strong>Precio base:</strong> ${price?.precioBase ?? 'N/D'}</p>
    <p><strong>Precio final:</strong> ${price?.precioFinal ?? 'N/D'}</p>
    <p><strong>Stock en bultos:</strong> ${stock?.cantBultos ?? 'N/D'}</p>
    <p><strong>Stock en unidades:</strong> ${stock?.cantUnidades ?? 'N/D'}</p>
  `;
  resultDiv.style.display = 'block';
}

async function handleSearch(event) {
  event.preventDefault();
  const articleId = document.getElementById('articleInput').value.trim();
  if (!articleId) return;
  try {
    const token = await ensureAuth();
    const [articulosResp, priceResp, stockResp] = await Promise.all([
      fetchArticle(articleId, token),
      fetchPrice(articleId, token),
      fetchStock(articleId, token)
    ]);
    // Las respuestas devuelven arreglos; tomamos el primero cuando corresponda
    const article = Array.isArray(articulosResp) ? articulosResp[0] : articulosResp;
    let price;
    if (Array.isArray(priceResp)) {
      // Buscamos en la lista de precios la entrada con idListaPrecio = 4 (lista por defecto).
      // Si no existe, tomamos la primera coincidencia disponible.
      price = priceResp.find(p => p.idListaPrecio === 4 || p.idListaPrecio == 4) || priceResp[0];
    } else {
      price = priceResp;
    }
    const stock = Array.isArray(stockResp) ? stockResp[0] : stockResp;
    renderResult({ article, price, stock });
  } catch (err) {
    alert(err.message);
    console.error(err);
    renderResult(null);
  }
}

document.getElementById('searchForm').addEventListener('submit', handleSearch);

// Añadimos un listener para sugerencias de búsqueda. Cuando el usuario escribe
// en el campo de artículo, descargamos la lista de artículos si no está en
// memoria y filtramos por coincidencias en la descripción. Las primeras 5
// coincidencias se insertan en el elemento datalist como opciones.
document.getElementById('articleInput').addEventListener('input', async (e) => {
  const term = e.target.value.trim().toLowerCase();
  const datalist = document.getElementById('articleSuggestions');
  if (!term) {
    datalist.innerHTML = '';
    return;
  }
  try {
    await loadAllArticles();
    const matches = articlesList.filter(item => {
      const desc = (item.desarticulo || item.desArticulo || item.dsArticulo || item.desCortaArticulo || '').toLowerCase();
      return desc.includes(term);
    }).slice(0, 5);
    datalist.innerHTML = matches.map(item => {
      const label = item.desArticulo || item.desarticulo || item.dsArticulo || item.desCortaArticulo || '';
      return `<option value="${item.idArticulo}" label="${label}"></option>`;
    }).join('');
  } catch (err) {
    console.error(err);
    datalist.innerHTML = '';
  }
});
