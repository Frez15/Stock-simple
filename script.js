// Frontend de la aplicación de consulta de stock y precios.
//
// Esta versión utiliza funciones serverless alojadas en `/api` dentro del mismo
// proyecto para comunicarse con ChessERP. De este modo el navegador no
// realiza peticiones cruzadas (CORS) hacia `simpledistribuciones.chesserp.com`,
// sino que todas las llamadas se hacen a nuestro propio dominio. Las
// funciones del directorio `api` manejan la autenticación y las llamadas a
// ChessERP en el servidor, evitando los problemas de CORS.

// Lista de artículos en memoria para autocompletar
let articlesList = null;

/**
 * Descarga la lista de artículos desde el servidor backend (`/api/articulos`).
 * Este endpoint devuelve todos los artículos no anulados. Se almacena en
 * `articlesList` para reutilizar en las sugerencias.
 */
async function loadAllArticles() {
  if (articlesList) return;
  const response = await fetch('/api/articulos');
  if (!response.ok) {
    throw new Error('Error al obtener artículos');
  }
  const data = await response.json();
  articlesList = Array.isArray(data) ? data : [data];
}

/**
 * Solicita los datos de un artículo por su ID al servidor backend.
 * @param {string|number} articleId
 */
async function fetchArticle(articleId) {
  const response = await fetch(`/api/articulo?id=${encodeURIComponent(articleId)}`);
  if (!response.ok) {
    throw new Error('Error consultando artículo');
  }
  return response.json();
}

/**
 * Solicita el stock de un artículo al servidor backend. El depósito predeterminado
 * se define en la función del backend.
 * @param {string|number} articleId
 */
async function fetchStock(articleId) {
  const response = await fetch(`/api/stock?id=${encodeURIComponent(articleId)}`);
  if (!response.ok) {
    throw new Error('Error consultando stock');
  }
  return response.json();
}

/**
 * Solicita el precio de un artículo al servidor backend. Por defecto utiliza
 * la lista de precios 4 y la fecha actual.
 * @param {string|number} articleId
 */
async function fetchPrice(articleId) {
  const response = await fetch(`/api/precio?id=${encodeURIComponent(articleId)}`);
  if (!response.ok) {
    throw new Error('Error consultando precio');
  }
  return response.json();
}

/**
 * Muestra en pantalla la información del artículo, precio y stock recibidos.
 * Si no hay datos, oculta el div de resultados.
 */
function renderResult(data) {
  const resultDiv = document.getElementById('result');
  if (!data) {
    resultDiv.style.display = 'none';
    return;
  }
  const { article, price, stock } = data;
  resultDiv.innerHTML = `
    <h3>${article?.desarticulo || article?.desArticulo || article?.dsArticulo || 'Artículo sin descripción'}</h3>
    <p><strong>Unidades por bulto:</strong> ${article?.unidadesBulto ?? 'N/D'}</p>
    <p><strong>Precio base:</strong> ${price?.precioBase ?? 'N/D'}</p>
    <p><strong>Precio final:</strong> ${price?.precioFinal ?? 'N/D'}</p>
    <p><strong>Stock en bultos:</strong> ${stock?.cantBultos ?? 'N/D'}</p>
    <p><strong>Stock en unidades:</strong> ${stock?.cantUnidades ?? 'N/D'}</p>
  `;
  resultDiv.style.display = 'block';
}

/**
 * Maneja el evento de búsqueda. Obtiene el ID ingresado, solicita datos al
 * backend y muestra los resultados.
 */
async function handleSearch(event) {
  event.preventDefault();
  const articleId = document.getElementById('articleInput').value.trim();
  if (!articleId) return;
  try {
    const [articulosResp, priceResp, stockResp] = await Promise.all([
      fetchArticle(articleId),
      fetchPrice(articleId),
      fetchStock(articleId)
    ]);
    const article = Array.isArray(articulosResp) ? articulosResp[0] : articulosResp;
    const price = Array.isArray(priceResp) ? priceResp[0] || null : priceResp;
    const stock = Array.isArray(stockResp) ? stockResp[0] || null : stockResp;
    renderResult({ article, price, stock });
  } catch (err) {
    alert(err.message);
    console.error(err);
    renderResult(null);
  }
}

// Asignamos el manejador al formulario de búsqueda
document.getElementById('searchForm').addEventListener('submit', handleSearch);

// Listener para autocompletado: cuando el usuario escribe, filtramos la lista
// de artículos y mostramos las primeras 5 coincidencias en el datalist. Si
// todavía no hemos descargado la lista completa la solicitamos al backend.
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
