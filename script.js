// Configuración
const CHESS_API_BASE = 'https://simpledistribuciones.chesserp.com/AR1268/web/api/chess/v1';
// Sustituye las siguientes constantes por tus credenciales. Para producción configura variables de entorno en Vercel.
const CHESS_USER = ''; // Usuario de ChessERP
const CHESS_PASSWORD = ''; // Contraseña de ChessERP
const ID_DEPOSITO = 1; // Depósito desde el cual consultar el stock

async function login() {
  const response = await fetch(`${CHESS_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: CHESS_USER, password: CHESS_PASSWORD })
  });
  if (!response.ok) {
    throw new Error('Error al autenticar');
  }
  const data = await response.json();
  return data.token || data.access_token;
}

async function fetchStock(articleId, token) {
  const url = new URL(`${CHESS_API_BASE}/stock/`);
  url.searchParams.append('idDeposito', ID_DEPOSITO);
  url.searchParams.append('idArticulo', articleId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
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
    headers: { Authorization: `Bearer ${token}` }
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
    headers: { Authorization: `Bearer ${token}` }
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
    const token = await login();
    const [articulosResp, priceResp, stockResp] = await Promise.all([
      fetchArticle(articleId, token),
      fetchPrice(articleId, token),
      fetchStock(articleId, token)
    ]);
    // Las respuestas devuelven arreglos; tomamos el primero cuando corresponda
    const article = Array.isArray(articulosResp) ? articulosResp[0] : articulosResp;
    let price;
    if (Array.isArray(priceResp)) {
      // Elegimos la primera coincidencia. Ajusta según tu lista de precios
      price = priceResp[0];
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
