// Frontend de la aplicación de consulta de artículos, stock y precio.
//
// Usa funciones serverless en /api (articulo, articulos, stock, precio) para
// comunicarse con ChessERP, evitando CORS y exponiendo solo endpoints propios.

// Lista de artículos en memoria para autocompletar
let articlesList = null;

// Conjuntos de claves conocidos que devuelve la API de ChessERP. El objetivo
// es hacer el código más tolerante a las variaciones entre endpoints
// (por ejemplo `desArticulo` vs `descripcion`).
const ARTICLE_CONTAINER_KEYS = [
  'articulo',
  'articulos',
  'eArticulos',
  'data',
  'items',
  'results',
  'lista',
  'value',
];
const STOCK_CONTAINER_KEYS = [
  'stock',
  'stocks',
  'eStockFisico',
  'existencias',
  'items',
  'data',
  'detalle',
  'resultado',
  'resultados',
];

const ARTICLE_ID_KEYS = [
  'idarticulo',
  'id_articulo',
  'idArticulo',
  'articulo',
  'codarticulo',
  'codArticulo',
  'codart',
  'CodArt',
  'codArt',
  'codigoarticulo',
  'codigoArticulo',
  'codigo',
];
const DESCRIPTION_KEYS = [
  'desarticulo',
  'desArticulo',
  'dsarticulo',
  'dsArticulo',
  'descripcion',
  'descripcionarticulo',
  'descripcionArticulo',
  'desCortaArticulo',
  'descArticulo',
  'descripcionCorta',
];
const UNITS_PER_PACK_KEYS = [
  'unidadesbulto',
  'unidadesBulto',
  'unibulto',
  'uniBulto',
  'unidadbulto',
  'unidadBulto',
  'cantxbulto',
  'cantXBulto',
  'cantbulto',
  'cantBulto',
  'cantidadxbulto',
  'cantidadXBulto',
  'cantidadbulto',
  'cantidadBulto',
  'cantidadBultos',
  'presentacion',
];
const STOCK_BULTOS_KEYS = [
  'cantbultos',
  'cantBultos',
  'cantbulto',
  'cantBulto',
  'stockbultos',
  'stockBultos',
  'stockbulto',
  'stockBulto',
  'bultos',
  'cantidadBultos',
];
const MINIMO_VENTA_KEYS = [
  'minimoVenta',
  'minimoventa',
  'cantMinima',
  'cantidadMinima',
];

const PESABLE_KEYS = [
  'pesable',
  'esPesable',
  'articuloPesable',
];

const STOCK_UNITS_KEYS = [
  'cantunidades',
  'cantUnidades',
  'stockunidades',
  'stockUnidades',
  'unidades',
  'cantidadUnidades',
  'existencia',
  'existencias',
  'stock',
  'cantidad',
];

// ======== NUEVO: helpers para PRECIOS ======== //
const PRICE_CONTAINER_KEYS = ['precios','lista','listaPrecios','items','data','resultado','resultados'];
const PRICE_FINAL_KEYS     = ['Precio_Final','precioFinal'];
const UNIDADES_BULTO_KEYS  = ['Unidades_Bulto','unidadBulto','unidadesBulto'];
// ============================================= //

/**
 * Formatea números como moneda en ARS con símbolo $ y 2 decimales.
 */
function formatNumber(n) {
  if (n === undefined || n === null || n === '' || isNaN(Number(n))) return 'N/D';
  return new Intl.NumberFormat('es-AR', { 
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(n));
}


/**
 * Devuelve el primer valor no vacío de un objeto que coincida con las claves especificadas.
 */
function pickField(source, keys) {
  if (!source || typeof source !== 'object') return undefined;

  const isUsableValue = (value) =>
    value !== undefined && value !== null && value !== '' && typeof value !== 'object';

  const entries = Object.entries(source);
  const loweredEntries = entries.map(([k, v]) => [k.toLowerCase(), v]);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    const directMatch = loweredEntries.find(([entryKey]) => entryKey === lowerKey);
    if (directMatch) {
      const value = directMatch[1];
      if (isUsableValue(value)) return value;
    }
  }
  // Segundo intento: coincidencia parcial
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    const partialMatch = entries.find(([entryKey, value]) => {
      if (!isUsableValue(value)) return false;
      return entryKey.toLowerCase().includes(lowerKey);
    });
    if (partialMatch) {
      return partialMatch[1];
    }
  }
  return undefined;
}

function hasRelevantInfo(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const keyGroups = [
    ARTICLE_ID_KEYS,
    DESCRIPTION_KEYS,
    UNITS_PER_PACK_KEYS,
    STOCK_BULTOS_KEYS,
    STOCK_UNITS_KEYS,
  ];
  return keyGroups.some((keys) => pickField(candidate, keys) !== undefined);
}

function resolvePrimaryEntry(payload, containerKeys = []) {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const resolved = resolvePrimaryEntry(item, containerKeys);
      if (resolved) return resolved;
    }
    return null;
  }
  if (typeof payload !== 'object') return null;

  if (hasRelevantInfo(payload)) return payload;

  for (const key of containerKeys) {
    const directValue = getValueCaseInsensitive(payload, key);
    if (directValue !== undefined) {
      const resolved = resolvePrimaryEntry(directValue, containerKeys);
      if (resolved && hasRelevantInfo(resolved)) return resolved;
    }
  }
  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object') {
      const resolved = resolvePrimaryEntry(value, containerKeys);
      if (resolved && hasRelevantInfo(resolved)) return resolved;
    }
  }
  return null;
}

function getValueCaseInsensitive(payload, key) {
  if (!payload || typeof payload !== 'object') return undefined;
  const lowerKey = key.toLowerCase();
  const matchedKey = Object.keys(payload).find(
    (entryKey) => entryKey.toLowerCase() === lowerKey
  );
  return matchedKey !== undefined ? payload[matchedKey] : undefined;
}

function unwrapArray(payload, containerKeys = []) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  for (const key of containerKeys) {
    const candidate = getValueCaseInsensitive(payload, key);
    if (candidate !== undefined) {
      const nested = unwrapArray(candidate, containerKeys);
      if (nested.length) return nested;
    }
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = unwrapArray(value, containerKeys);
      if (nested.length) return nested;
    }
  }
  return hasRelevantInfo(payload) ? [payload] : [];
}

function findEntryById(payload, containerKeys = [], targetId) {
  if (targetId === undefined || targetId === null) {
    return resolvePrimaryEntry(payload, containerKeys);
  }
  const normalizedId = String(targetId).trim().toLowerCase();
  if (!normalizedId) {
    return resolvePrimaryEntry(payload, containerKeys);
  }
  const list = unwrapArray(payload, containerKeys);
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const candidateId = pickField(item, ARTICLE_ID_KEYS);
    if (candidateId === undefined) continue;
    const normalizedCandidate = String(candidateId).trim().toLowerCase();
    if (normalizedCandidate === normalizedId) return item;
  }
  if (list.length) {
    const fallback = resolvePrimaryEntry(list, containerKeys);
    if (fallback) return fallback;
    return list.find((item) => hasRelevantInfo(item)) || list[0] || null;
  }
  return resolvePrimaryEntry(payload, containerKeys);
}

function displayValue(value) {
  return value === undefined || value === null || value === '' ? 'N/D' : value;
}

// =================== Requests al backend =================== //
async function loadAllArticles() {
  if (articlesList) return;
  const response = await fetch('/api/articulos');
  if (!response.ok) throw new Error('Error al obtener artículos');
  const data = await response.json();
  const rawList = unwrapArray(data, ARTICLE_CONTAINER_KEYS);
  articlesList = rawList
    .map((item) => resolvePrimaryEntry(item, ARTICLE_CONTAINER_KEYS) || item)
    .filter((item) => item && typeof item === 'object');
}

async function fetchArticle(articleId) {
  const response = await fetch(`/api/articulo?id=${encodeURIComponent(articleId)}`);
  if (!response.ok) throw new Error('Error consultando artículo');
  return response.json();
}

async function fetchStock(articleId) {
  const response = await fetch(`/api/stock?id=${encodeURIComponent(articleId)}`);
  if (!response.ok) throw new Error('Error consultando stock');
  return response.json();
}

// El backend fuerza lista=4 y fecha=hoy; acá solo pasamos id
async function fetchPrice(articleId) {
  const resp = await fetch(`/api/precio?id=${encodeURIComponent(articleId)}`);
  if (!resp.ok) throw new Error('Error consultando precio');
  return resp.json(); // lista (0..N)
}

function pickPriceEntry(payload) {
  const arr = unwrapArray(payload, PRICE_CONTAINER_KEYS);
  // Devolvemos el primero que tenga Precio_Final
  for (const it of arr) {
    const pf = pickField(it, PRICE_FINAL_KEYS);
    if (pf !== undefined) return it;
  }
  return resolvePrimaryEntry(payload, PRICE_CONTAINER_KEYS);
}
// =========================================================== //

/**
 * Muestra en pantalla la info del artículo, stock y precio.
 */
function renderResult(data) {
  const resultDiv = document.getElementById('result');
  if (!data) {
    resultDiv.style.display = 'none';
    return;
  }

  const article = resolvePrimaryEntry(data.article, ARTICLE_CONTAINER_KEYS) || null;
  const stock   = resolvePrimaryEntry(data.stock,   STOCK_CONTAINER_KEYS)   || null;
  const price   = data.price ? pickPriceEntry(data.price) : null;
  const minimoVenta = article && pickField(article, MINIMO_VENTA_KEYS);
  const pesable = article && pickField(article, PESABLE_KEYS);

  const description = pickField(article, DESCRIPTION_KEYS) || 'Artículo sin descripción';

  // Unidades por bulto (del artículo) con fallback en 'presentacion'
  let unitsPerPack = pickField(article, UNITS_PER_PACK_KEYS);
  if (unitsPerPack === undefined) {
    const presentacion = pickField(article, ['presentacion']);
    if (presentacion && typeof presentacion === 'object') {
      unitsPerPack = pickField(presentacion, [
        'cantidad',
        'cantidadBulto',
        'cantidadXBulto',
        'cantXBulto',
      ]);
    }
  }

  const stockBultos   = pickField(stock, STOCK_BULTOS_KEYS);
  const stockUnidades = pickField(stock, STOCK_UNITS_KEYS);

  // ======== NUEVO: precio x bulto y unitario ======== //
  const precioFinal     = price && pickField(price, PRICE_FINAL_KEYS);
  const unidadesBultoPx = price && pickField(price, UNIDADES_BULTO_KEYS);
  const unidadesParaUnit = (unidadesBultoPx !== undefined && !isNaN(Number(unidadesBultoPx)))
    ? Number(unidadesBultoPx)
    : (unitsPerPack !== undefined && !isNaN(Number(unitsPerPack)) ? Number(unitsPerPack) : null);

  let precioUnitario = null;
  if (precioFinal !== undefined && unidadesParaUnit && Number(unidadesParaUnit) !== 0) {
    precioUnitario = Number(precioFinal) / Number(unidadesParaUnit);
  }
  // =================================================== //

  resultDiv.innerHTML = `
    <h3>${description}</h3>
    <p><strong>Unidades por bulto:</strong> ${displayValue(unitsPerPack)}</p>
    <p><strong>Stock en bultos:</strong> ${displayValue(stockBultos)}</p>
    <p><strong>Stock en unidades:</strong> ${displayValue(stockUnidades)}</p>
    <hr>
    <p><strong>Precio x bulto:</strong> ${formatNumber(precioFinal)}</p>
    <p><strong>Precio unitario:</strong> ${formatNumber(precioUnitario)}</p>
    <p><strong>Mínimo de venta:</strong> ${displayValue(minimoVenta)}</p>
    <p><strong>Pesable:</strong> ${pesable ? 'Sí' : 'No'}</p>

  `;
  resultDiv.style.display = 'block';
}

/**
 * Maneja el evento de búsqueda. Obtiene el ID ingresado, solicita datos al backend y muestra los resultados.
 */
async function handleSearch(event) {
  event.preventDefault();
  const articleId = document.getElementById('articleInput').value.trim();
  if (!articleId) return;
  try {
    const [articulosResp, stockResp, preciosResp] = await Promise.all([
      fetchArticle(articleId),
      fetchStock(articleId),
      fetchPrice(articleId),
    ]);

    const article =
      resolvePrimaryEntry(articulosResp, ARTICLE_CONTAINER_KEYS) ||
      (Array.isArray(articulosResp) ? articulosResp[0] : articulosResp);
    const stock =
      findEntryById(stockResp, STOCK_CONTAINER_KEYS, articleId) ||
      resolvePrimaryEntry(stockResp, STOCK_CONTAINER_KEYS) ||
      (Array.isArray(stockResp) ? stockResp[0] || null : stockResp);
    const price = pickPriceEntry(preciosResp) || (Array.isArray(preciosResp) ? preciosResp[0] : preciosResp);

    renderResult({ article, stock, price });
  } catch (err) {
    alert(err.message);
    console.error(err);
    renderResult(null);
  }
}

// Asignamos el manejador al formulario de búsqueda
document.getElementById('searchForm').addEventListener('submit', handleSearch);

document.getElementById('articleInput').addEventListener('input', async (e) => {
  const termRaw = e.target.value.trim();
  const term = termRaw.toLowerCase();
  const datalist = document.getElementById('articleSuggestions');

  // Mostrar sugerencias SOLO si hay 3+ caracteres
  if (term.length < 3) {
    datalist.innerHTML = '';
    return;
  }

  try {
    await loadAllArticles();

    // Filtrar por descripción que contenga el término o por código que empiece con el término
    const matches = articlesList
      .map((item) => resolvePrimaryEntry(item, ARTICLE_CONTAINER_KEYS) || item)
      .filter((item) => {
        const desc = (pickField(item, DESCRIPTION_KEYS) || '').toLowerCase();
        const code = String(pickField(item, ARTICLE_ID_KEYS) || '').toLowerCase();
        return desc.includes(term) || code.startsWith(term);
      })
      .slice(0, 10); // mostramos hasta 10

    datalist.innerHTML = matches
      .map((item) => {
        const label = pickField(item, DESCRIPTION_KEYS) || '';
        const value = pickField(item, ARTICLE_ID_KEYS) || '';
        if (!value && !label) return '';
        // En datalist: value = lo que se inserta en el input (código),
        // label = lo que muestra la lista (descripción).
        return `<option value="${value}" label="${label}"></option>`;
      })
      .join('');
  } catch (err) {
    console.error(err);
    datalist.innerHTML = '';
  }
});

