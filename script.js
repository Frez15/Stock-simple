// Frontend de la aplicación de consulta de artículos y stock.
//
// Esta versión utiliza funciones serverless alojadas en `/api` dentro del mismo
// proyecto para comunicarse con ChessERP. De este modo el navegador no
// realiza peticiones cruzadas (CORS) hacia `simpledistribuciones.chesserp.com`,
// sino que todas las llamadas se hacen a nuestro propio dominio. Las
// funciones del directorio `api` manejan la autenticación y las llamadas a
// ChessERP en el servidor, evitando los problemas de CORS.

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

const PRICE_CONTAINER_KEYS = [
  'listaPrecios',
  'listaPreciosVigentes',
  'listaPrecio',
  'lista',
  'precios',
  'data',
];
const PRICE_FINAL_KEYS = [
  'prefin',
  'preciofinal',
  'precioFinal',
  'precio',
  'precioBase',
  'Precio Final',
];
const PRICE_LIST_CODE_KEYS = [
  'listaspre',
  'lista',
  'codigolistaprecio',
  'codigoLista',
  'codLista',
];
const PRICE_LIST_DESCRIPTION_KEYS = [
  'titulis',
  'descripcionlista',
  'descripcionLista',
  'listaDescripcion',
  'descripcion',
];
const PRICE_VALID_FROM_KEYS = [
  'fhvigenciadesde',
  'vigentedesde',
  'vigenciaDesde',
  'desde',
];
const PRICE_VALID_TO_KEYS = [
  'fhvigenciahasta',
  'vigentehasta',
  'vigenciaHasta',
  'hasta',
];
const PRICE_CONSUMER_KEYS = [
  'preconsumidor',
  'precioConsumidor',
  'precioConsumidorFinal',
];

/**
 * Devuelve el primer valor no vacío de un objeto que coincida con las claves
 * especificadas. Se realiza la comparación de forma case-insensitive y, si no
 * se encuentra un match exacto, se buscan claves que contengan el nombre
 * proporcionado (por ejemplo `cantidadXBulto`).
 * @param {object|null|undefined} source
 * @param {string[]} keys
 * @returns {*|undefined}
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
  // Segundo intento: coincidencia parcial (útil para claves como `cantidadXBulto`).
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
    PRICE_FINAL_KEYS,
    PRICE_LIST_DESCRIPTION_KEYS,
  ];
  return keyGroups.some((keys) => pickField(candidate, keys) !== undefined);
}

/**
 * Dado un payload con estructura variable, intenta obtener el elemento
 * principal (primer artículo o stock). Se exploran las claves
 * indicadas y cualquier otro valor que contenga objetos o arrays.
 * @param {*} payload
 * @param {string[]} containerKeys
 * @returns {object|null}
 */
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

  if (hasRelevantInfo(payload)) {
    return payload;
  }

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

/**
 * Convierte un payload arbitrario en una lista de elementos para autocompletado.
 * Busca arrays en las claves indicadas y, si no encuentra ninguno, devuelve un
 * array con el propio payload (cuando contiene información útil).
 * @param {*} payload
 * @param {string[]} containerKeys
 * @returns {object[]}
 */
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
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const nested = unwrapArray(value, containerKeys);
      if (nested.length) return nested;
    }
  }

  return hasRelevantInfo(payload) ? [payload] : [];
}

/**
 * Busca dentro de un payload arbitrario el elemento cuyo ID coincide con el
 * proporcionado. Si no encuentra coincidencia, devuelve la primera entrada con
 * información relevante como fallback.
 * @param {*} payload
 * @param {string[]} containerKeys
 * @param {string|number} targetId
 * @returns {object|null}
 */
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
    if (normalizedCandidate === normalizedId) {
      return item;
    }
  }

  if (list.length) {
    const fallback = resolvePrimaryEntry(list, containerKeys);
    if (fallback) return fallback;
    return list.find((item) => hasRelevantInfo(item)) || list[0] || null;
  }

  return resolvePrimaryEntry(payload, containerKeys);
}

/**
 * Devuelve un valor formateado o 'N/D' si está vacío.
 * @param {*} value
 * @returns {string|number}
 */
function displayValue(value) {
  return value === undefined || value === null || value === '' ? 'N/D' : value;
}

/**
 * Formatea un valor numérico como moneda en pesos argentinos. Si no se puede
 * convertir a número, devuelve el valor tal cual.
 * @param {*} value
 * @returns {string}
 */
function displayPrice(value) {
  if (value === undefined || value === null || value === '') return 'N/D';
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
    }).format(numberValue);
  }
  return String(value);
}

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
  const rawList = unwrapArray(data, ARTICLE_CONTAINER_KEYS);
  articlesList = rawList
    .map((item) => resolvePrimaryEntry(item, ARTICLE_CONTAINER_KEYS) || item)
    .filter((item) => item && typeof item === 'object');
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
 * Solicita el precio vigente de un artículo al servidor backend. Por defecto se
 * consulta la lista 4 y la fecha actual.
 * @param {string|number} articleId
 * @param {{ lista?: string|number, fecha?: string }} [options]
 */
async function fetchPrice(articleId, options = {}) {
  const params = new URLSearchParams();
  params.set('id', articleId);
  const { lista, fecha } = options;
  if (lista !== undefined && lista !== null && lista !== '') {
    params.set('lista', lista);
  }
  if (fecha) {
    params.set('fecha', fecha);
  }
  const response = await fetch(`/api/precio?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Error consultando precio');
  }
  return response.json();
}

/**
 * Muestra en pantalla la información del artículo y stock recibidos.
 * Si no hay datos, oculta el div de resultados.
 */
function renderResult(data) {
  const resultDiv = document.getElementById('result');
  if (!data) {
    resultDiv.style.display = 'none';
    return;
  }

  const article = resolvePrimaryEntry(data.article, ARTICLE_CONTAINER_KEYS) || null;
  const stock = resolvePrimaryEntry(data.stock, STOCK_CONTAINER_KEYS) || null;
  const priceEntry = resolvePrimaryEntry(data.price, PRICE_CONTAINER_KEYS) || null;

  const description = pickField(article, DESCRIPTION_KEYS) || 'Artículo sin descripción';
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
  const stockBultos = pickField(stock, STOCK_BULTOS_KEYS);
  const stockUnidades = pickField(stock, STOCK_UNITS_KEYS);
  const finalPrice = priceEntry ? pickField(priceEntry, PRICE_FINAL_KEYS) : undefined;
  const listCode = priceEntry ? pickField(priceEntry, PRICE_LIST_CODE_KEYS) : undefined;
  const listDescription = priceEntry
    ? pickField(priceEntry, PRICE_LIST_DESCRIPTION_KEYS)
    : undefined;
  const validFrom = priceEntry ? pickField(priceEntry, PRICE_VALID_FROM_KEYS) : undefined;
  const validTo = priceEntry ? pickField(priceEntry, PRICE_VALID_TO_KEYS) : undefined;
  const consumerPrice = priceEntry
    ? pickField(priceEntry, PRICE_CONSUMER_KEYS)
    : undefined;

  const listLabel = listDescription || (listCode ? `Lista ${listCode}` : null);
  const validityLabel = validFrom || validTo ? `${displayValue(validFrom)} - ${displayValue(validTo)}` : null;

  resultDiv.innerHTML = `
    <h3>${description}</h3>
    <p><strong>Unidades por bulto:</strong> ${displayValue(unitsPerPack)}</p>
    <p><strong>Stock en bultos:</strong> ${displayValue(stockBultos)}</p>
    <p><strong>Stock en unidades:</strong> ${displayValue(stockUnidades)}</p>
    <p><strong>Lista consultada:</strong> ${displayValue(listLabel)}</p>
    <p><strong>Vigencia:</strong> ${displayValue(validityLabel)}</p>
    <p><strong>Precio final:</strong> ${displayPrice(finalPrice)}</p>
    <p><strong>Precio consumidor:</strong> ${displayPrice(consumerPrice)}</p>
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
    const today = new Date().toISOString().slice(0, 10);
    const DEFAULT_LISTA = 4;
    const [articulosResp, stockResp, priceResp] = await Promise.all([
      fetchArticle(articleId),
      fetchStock(articleId),
      fetchPrice(articleId, { lista: DEFAULT_LISTA, fecha: today }),
    ]);
    const article =
      resolvePrimaryEntry(articulosResp, ARTICLE_CONTAINER_KEYS) ||
      (Array.isArray(articulosResp) ? articulosResp[0] : articulosResp);
    const stock =
      findEntryById(stockResp, STOCK_CONTAINER_KEYS, articleId) ||
      resolvePrimaryEntry(stockResp, STOCK_CONTAINER_KEYS) ||
      (Array.isArray(stockResp) ? stockResp[0] || null : stockResp);
    const price =
      resolvePrimaryEntry(priceResp, PRICE_CONTAINER_KEYS) ||
      (Array.isArray(priceResp) ? priceResp[0] || null : priceResp);
    renderResult({ article, stock, price });
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
    const matches = articlesList
      .map((item) => resolvePrimaryEntry(item, ARTICLE_CONTAINER_KEYS) || item)
      .filter((item) => {
        const desc = (pickField(item, DESCRIPTION_KEYS) || '').toLowerCase();
        return desc.includes(term);
      })
      .slice(0, 5);
    datalist.innerHTML = matches
      .map((item) => {
        const label = pickField(item, DESCRIPTION_KEYS) || '';
        const value = pickField(item, ARTICLE_ID_KEYS) || '';
        if (!value && !label) return '';
        return `<option value="${value}" label="${label}"></option>`;
      })
      .join('');
  } catch (err) {
    console.error(err);
    datalist.innerHTML = '';
  }
});
