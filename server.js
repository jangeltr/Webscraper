'use strict';

// Cargar variables de entorno desde .env si existe
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8')
    .split('\n')
    .forEach(line => {
      const eq = line.indexOf('=');
      if (eq < 1 || line.trimStart().startsWith('#')) return;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && v && !process.env[k]) process.env[k] = v;
    });
} catch {}

const express   = require('express');
const axios     = require('axios');
const cheerio   = require('cheerio');
const path      = require('path');
const puppeteer = require('puppeteer-core');

const app  = express();
const PORT = process.env.PORT || 3000;

// Ruta al Chrome/Chromium del sistema
const CHROME_PATH = process.env.CHROME_PATH
  || ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']
       .find(p => { try { require('fs').accessSync(p); return true; } catch { return false; } })
  || 'google-chrome';

// Sitios que requieren JavaScript (CSR / bot-detection avanzado)
const JS_REQUIRED_HOSTS = [
  'mercadolibre', 'cyberpuerta', 'digitalife', 'ditalife',
  'walmart', 'amazon', 'liverpool',
];

// Instancia compartida del navegador (se reutiliza entre peticiones)
let browser = null;
async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless      : true,
      args          : [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-gpu',
      ],
    });
    console.log('[puppeteer] Navegador iniciado:', CHROME_PATH);
  }
  return browser;
}

// Servir la app frontend como archivos estáticos
app.use(express.static(path.join(__dirname)));

// ── Headers que imitan un navegador Chrome real ───────────────
const BROWSER_HEADERS = {
  'User-Agent'               : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'                   : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language'          : 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding'          : 'gzip, deflate, br',
  'Connection'               : 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest'           : 'document',
  'Sec-Fetch-Mode'           : 'navigate',
  'Sec-Fetch-Site'           : 'none',
  'Sec-Fetch-User'           : '?1',
  'Cache-Control'            : 'max-age=0',
};

// ── Construye URL de búsqueda para cada proveedor ─────────────
function buildSearchUrl(baseUrl, product) {
  try {
    // Plantilla configurada por el usuario: https://tienda.mx/buscar?q={q}
    if (/\{q\}/i.test(baseUrl)) {
      return baseUrl.replace(/\{q\}/gi, encodeURIComponent(product));
    }

    const url  = new URL(baseUrl);
    const host = url.hostname;

    if (host.includes('cyberpuerta'))  return `https://www.cyberpuerta.mx/buscar?q=${encodeURIComponent(product)}`;
    if (host.includes('digitalife'))   return `https://www.digitalife.com.mx/buscar/t_${encodeURIComponent(product)}`;
    if (host.includes('ditalife'))     return `https://www.digitalife.com.mx/buscar/t_${encodeURIComponent(product)}`;
    if (host.includes('lumen.mx'))     return `https://www.lumen.mx/search?q=${encodeURIComponent(product)}`;
    if (host.includes('amazon'))       return `https://www.amazon.com.mx/s?k=${encodeURIComponent(product)}`;
    if (host.includes('walmart'))      return `https://www.walmart.com.mx/search?q=${encodeURIComponent(product)}`;
    if (host.includes('liverpool'))    return `https://www.liverpool.com.mx/tienda/search?textSearch=${encodeURIComponent(product)}`;
    if (host.includes('elektra'))      return `https://www.elektra.com.mx/busqueda?query=${encodeURIComponent(product)}`;
    if (host.includes('costco'))       return `https://www.costco.com.mx/search?q=${encodeURIComponent(product)}`;
    if (host.includes('staples'))      return `https://www.staples.com.mx/search?q=${encodeURIComponent(product)}`;
    if (host.includes('officemax'))
      return `https://www.officemax.com.mx/buscar?q=${encodeURIComponent(product)}`;
    if (host.includes('officedepot'))
      return `https://www.officedepot.com.mx/buscar?q=${encodeURIComponent(product)}`;

    // Detectar parámetro de búsqueda existente en la URL
    for (const p of ['q', 'query', 'search', 'buscar', 'keyword', 'term', 's', 'searchTerm']) {
      if (url.searchParams.has(p)) { url.searchParams.set(p, product); return url.toString(); }
    }
    if (/buscar|search|productos|catalogo/i.test(url.pathname)) {
      url.searchParams.set('q', product);
      return url.toString();
    }

    url.searchParams.set('q', product);
    return url.toString();
  } catch { return baseUrl; }
}

// ── Búsqueda recursiva de arrays de productos en JSON ─────────
function findProductArrays(obj, depth = 0) {
  if (depth > 7 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      const first = obj[0];
      if (
        (first.price !== undefined || first.sale_price !== undefined) &&
        (first.title ?? first.name ?? first.product_title)
      ) return obj;
    }
    return obj.flatMap(v => findProductArrays(v, depth + 1));
  }
  return Object.values(obj).flatMap(v => findProductArrays(v, depth + 1));
}

// Formatea precio en MXN
function formatPrice(raw) {
  const n = Number(raw);
  if (isNaN(n) || n <= 0) return String(raw);
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
}

// ── Parsea HTML con múltiples estrategias ─────────────────────
function parseHTML(html, query) {
  const $     = cheerio.load(html);
  const items = [];

  // ① JSON-LD schema.org
  $('script[type="application/ld+json"]').each((_, el) => {
    if (items.length >= 8) return;
    try {
      const raw   = JSON.parse($(el).html());
      const nodes = Array.isArray(raw) ? raw : (raw['@graph'] ? raw['@graph'] : [raw]);
      nodes.forEach(node => {
        const types = [].concat(node['@type'] || []);
        if (types.includes('Product')) {
          const offer = [].concat(node.offers || [])[0];
          const price = offer?.price ?? offer?.lowPrice;
          if (price != null) items.push({ name: node.name || '—', price: formatPrice(price), url: node.url || offer?.url || null });
        }
        if (types.includes('ItemList')) {
          [].concat(node.itemListElement || []).slice(0, 8).forEach(el => {
            const item  = el.item ?? el;
            const offer = [].concat(item.offers || [])[0];
            const price = offer?.price ?? offer?.lowPrice;
            if (price != null) items.push({ name: item.name || '—', price: formatPrice(price), url: item.url || null });
          });
        }
      });
    } catch {}
  });

  // ② Next.js __NEXT_DATA__ (MercadoLibre, Coppel…)
  if (items.length === 0) {
    const el = $('#__NEXT_DATA__');
    if (el.length) {
      try {
        const data  = JSON.parse(el.html());
        const found = findProductArrays(data?.props ?? data);
        found.slice(0, 8).forEach(item => {
          const p = item.price ?? item.sale_price ?? item.min_price;
          const n = item.title ?? item.name ?? item.product_title ?? '—';
          if (p != null) items.push({ name: n, price: formatPrice(p), url: item.permalink ?? item.url ?? null });
        });
      } catch {}
    }
  }

  // ③ Nuxt 3 __NUXT_DATA__ (Cyberpuerta, Digitalife…)
  if (items.length === 0) {
    const el = $('#__NUXT_DATA__');
    if (el.length) {
      try {
        const raw   = JSON.parse(el.html());
        const found = findProductArrays(Array.isArray(raw) ? { r: raw } : raw);
        found.slice(0, 8).forEach(item => {
          const p = item.price ?? item.sale_price ?? item.precio ?? item.finalPrice;
          const n = item.title ?? item.name ?? item.nombre ?? item.productTitle ?? '—';
          if (p != null) items.push({ name: n, price: formatPrice(p), url: item.permalink ?? item.url ?? null });
        });
      } catch {}
    }
  }

  // ④ JSON embebido en <script> (Angular, Vue, custom)
  if (items.length === 0) {
    $('script:not([src]):not([type="application/ld+json"])').each((_, el) => {
      if (items.length > 0) return;
      const txt = ($(el).html() || '').trim();
      if (!txt.startsWith('{') && !txt.startsWith('[')) return;
      try {
        const parsed = JSON.parse(txt);
        const found  = findProductArrays(Array.isArray(parsed) ? { r: parsed } : parsed);
        found.slice(0, 8).forEach(item => {
          const p = item.price ?? item.sale_price;
          const n = item.title ?? item.name ?? '—';
          if (p != null) items.push({ name: n, price: formatPrice(p), url: item.permalink ?? item.url ?? null });
        });
      } catch {}
    });
  }

  // ⑤ Regex sobre HTML crudo (pares title+price en JSON parcial)
  if (items.length === 0) {
    const re = /"(?:title|name|product_title)"\s*:\s*"([^"]{5,120})".{1,400}?"(?:price|sale_price)"\s*:\s*([\d.]+)/gs;
    let m;
    while ((m = re.exec(html)) !== null && items.length < 8) {
      const n = m[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const p = parseFloat(m[2]);
      if (p > 0) items.push({ name: n, price: formatPrice(p), url: null });
    }
  }

  // ⑥ Microdata itemprop
  if (items.length === 0) {
    $('[itemtype*="schema.org/Product"]').each((_, el) => {
      const $el  = $(el);
      const name = $el.find('[itemprop="name"]').first().text().trim();
      const pe   = $el.find('[itemprop="price"]').first();
      const price = pe.attr('content') || pe.text().trim();
      const url   = $el.find('[itemprop="url"]').first().attr('href') || null;
      if (price && /\d/.test(price)) items.push({ name: name || '—', price, url });
    });
  }

  // ⑦ Open Graph meta (páginas de producto individual)
  if (items.length === 0) {
    const price = $('meta[property="product:price:amount"]').attr('content')
               || $('meta[name="price"]').attr('content');
    if (price) items.push({
      name : $('meta[property="og:title"]').attr('content') || '—',
      price,
      url  : $('meta[property="og:url"]').attr('content') || null,
    });
  }

  // ⑧ OpenCart
  if (items.length === 0) {
    $('.product-layout, .product-thumb').each((_, card) => {
      const $c  = $(card);
      const name  = $c.find('.name a, .product-name a, h4 a').first().text().trim();
      const price = $c.find('.price, .price-new, .price-normal').first().text().trim();
      const link  = $c.find('a[href]').first().attr('href') || null;
      if (price && /\d/.test(price)) items.push({ name: name || '—', price, url: link });
    });
  }

  // ⑨ PrestaShop
  if (items.length === 0) {
    $('.product-miniature, .ajax_block_product, .js-product').each((_, card) => {
      const $c  = $(card);
      const name  = $c.find('.product-title a, .product-name a, h3 a, h2 a').first().text().trim();
      const price = $c.find('.price, .product-price, .regular-price').first().text().trim()
                 || $c.find('[itemprop="price"]').first().attr('content');
      const link  = $c.find('a[href]').first().attr('href') || null;
      if (price && /\d/.test(price)) items.push({ name: name || '—', price, url: link });
    });
  }

  // ⑩ WooCommerce / Shopify / Vue / Nuxt genérico
  if (items.length === 0) {
    const selectors = [
      '.products .product', '.product-grid-item', '.product-card',
      '.woocommerce li.product', '[class*="product-item"]', '[class*="item-product"]',
      'article[class*="product"]', '.search-result-item',
      '[class*="ProductCard"]', '[class*="ProductItem"]',
      '.product-list-item', '.cp-product', '[data-testid*="product"]',
    ];
    for (const sel of selectors) {
      const cards = $(sel).slice(0, 8).toArray();
      if (!cards.length) continue;
      cards.forEach(card => {
        const $c      = $(card);
        const nameEl  = $c.find('h2,h3,.product-title,.product-name,[class*="title"],[class*="name"]').first();
        const priceEl = $c.find('.price,.woocommerce-Price-amount,[class*="price"],[class*="Price"],[data-price]').first();
        const link    = $c.find('a[href]').first().attr('href') || null;
        const pt      = (priceEl.attr('data-price') || priceEl.text() || '').trim();
        if (pt && /\d/.test(pt) && pt.length < 40) {
          items.push({ name: nameEl.text().trim() || '—', price: pt, url: link });
        }
      });
      if (items.length) break;
    }
  }

  // ⑪ Fallback: selectores genéricos de precio
  if (items.length === 0) {
    const priceSelectors = [
      '[class*="product-price"]', '[class*="productPrice"]', '[class*="precio"]',
      '[data-price]', '[itemprop="price"]', '.andes-money-amount',
    ];
    for (const sel of priceSelectors) {
      const els = $(sel).slice(0, 8).toArray();
      if (!els.length) continue;
      els.forEach(el => {
        const $el  = $(el);
        const text = ($el.attr('data-price') || $el.text()).trim();
        if (!text || !/\d/.test(text) || text.length > 60) return;
        const $sec = $el.closest('article, li, [class*="product"], [class*="item"], [class*="card"]');
        const name = $sec.find('h2,h3,h4,[class*="title"],[class*="name"]').first().text().trim();
        const link = $sec.find('a[href]').first().attr('href') || null;
        items.push({ name: name || '—', price: text, url: link });
      });
      if (items.length) break;
    }
  }

  // Limpiar precios: quitar prefijos de texto (ej. "Normal$19,258" → "$19,258")
  items.forEach(it => {
    const m = it.price.match(/\$[\d,]+(?:\.\d+)?/);
    if (m) it.price = m[0];
  });

  // Filtrar por relevancia (normalizando acentos)
  const norm  = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = norm(query).split(/\s+/).filter(w => w.length > 2);
  const relevant = items.filter(it => words.some(w => norm(it.name).includes(w)));
  return (relevant.length ? relevant : items).slice(0, 8);
}

// ── Puppeteer: setup de página con anti-detección ────────────
async function newPage() {
  const br   = await getBrowser();
  const page = await br.newPage();
  await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
  await page.setExtraHTTPHeaders({ 'Accept-Language': BROWSER_HEADERS['Accept-Language'] });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return page;
}

// ── Extrae items de producto del DOM (para páginas renderizadas con JS) ──
async function domExtract(page) {
  return page.evaluate(() => {
    const results = [];

    // Intentar varios selectores de tarjeta de producto
    const cardSelectors = [
      // Cyberpuerta
      '.cpd-product-card-catalog',
      // MercadoLibre
      '.ui-search-result__wrapper', '.andes-card.ui-search-result',
      // Genéricos
      '.product-card', '[class*="ProductCard"]', '[class*="product-item"]',
      '.product', '[class*="product-card"]', 'li[class*="item"]',
    ];

    for (const sel of cardSelectors) {
      const cards = [...document.querySelectorAll(sel)].slice(0, 8);
      if (!cards.length) continue;

      for (const card of cards) {
        // Nombre
        const nameEl = card.querySelector(
          '[class*="name"], [class*="title"], [class*="Name"], [class*="Title"], h2, h3, h4'
        );
        // Precio
        const priceEl = card.querySelector(
          '[class*="price"], [class*="Price"], [class*="precio"], [class*="amount"], [data-price]'
        );
        const link = card.querySelector('a[href]');
        const name  = nameEl?.textContent?.trim();
        const price = (priceEl?.getAttribute('data-price') || priceEl?.textContent || '').trim();
        if (name && price && /\d/.test(price) && price.length < 50) {
          results.push({ name, price, url: link?.href || null });
        }
      }
      if (results.length >= 3) break;
    }

    return results;
  });
}

// ── Puppeteer: navegar a URL y esperar contenido ──────────────
async function puppeteerFetch(targetUrl) {
  const page = await newPage();
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

// ── Cyberpuerta: búsqueda con intercepción de respuestas API ──
async function scrapeCyberpuerta(product) {
  const page = await newPage();
  const capturedProducts = [];

  // Interceptar respuestas JSON que contengan datos de productos
  page.on('response', async (resp) => {
    try {
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const json = await resp.json();
      const found = findProductArrays(json);
      if (found.length > 0) capturedProducts.push(...found);
    } catch {}
  });

  try {
    await page.goto('https://www.cyberpuerta.mx/', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.cp-search-bar__input-text', { timeout: 10000 });
    await page.click('.cp-search-bar__input-text');
    await page.type('.cp-search-bar__input-text', product, { delay: 80 });

    const homeUrl = await page.url();
    await page.click('.cp-button-icon');

    // Esperar cambio de URL (navegación SPA)
    await page.waitForFunction(
      (base) => window.location.href !== base,
      { timeout: 15000 },
      homeUrl,
    ).catch(() => {});

    const currentUrl = await page.url();
    console.log(`[CP] URL destino: ${currentUrl}`);

    // Esperar a que terminen las llamadas de red
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 }).catch(() => {});

    // Usar datos capturados de las respuestas API (más limpio que DOM — precios sin duplicados)
    if (capturedProducts.length > 0) {
      console.log(`[CP] ${capturedProducts.length} productos capturados de API`);
      // Deduplicar por URL o nombre antes de formatear
      const seen = new Set();
      const unique = capturedProducts.filter(item => {
        const key = item.url ?? item.permalink ?? item.link ?? item.title ?? item.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const formatted = unique.map(item => ({
        name : item.title ?? item.name ?? item.nombre ?? '—',
        price: formatPrice(item.price ?? item.precio ?? item.finalPrice ?? item.sale_price),
        url  : item.url ?? item.permalink ?? item.link ?? null,
      })).filter(it => it.price && it.price !== 'NaN' && it.name !== '—');

      // Filtrar por relevancia (normalizando acentos para comparar "toner" con "Tóner")
      const norm  = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const words = norm(product).split(/\s+/).filter(w => w.length > 2);
      const relevant = formatted.filter(it => words.some(w => norm(it.name).includes(w)));
      console.log(`[CP] relevantes:${relevant.length}/${formatted.length} para "${product}"`);
      const result = (relevant.length > 0 ? relevant : formatted).slice(0, 8);
      return result;
    }

    throw new Error('No se encontraron productos en Cyberpuerta.');
  } finally {
    await page.close();
  }
}



// ── Digitalife: homepage search → API interception ───────────
async function scrapeDigitalife(product) {
  const page = await newPage();
  const captured = [];

  page.on('response', async (resp) => {
    try {
      if (!resp.url().includes('core.digitalife') && !resp.url().includes('digitalife')) return;
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const json = await resp.json();
      const found = findProductArrays(json);
      if (found.length > 0) captured.push(...found);
    } catch {}
  });

  try {
    await page.goto('https://www.digitalife.com.mx/', { waitUntil: 'networkidle2', timeout: 30000 });

    const homeUrl = await page.url();

    // Enfocar y usar el input de búsqueda visible
    const inputHandle = await page.evaluateHandle(() => {
      return [...document.querySelectorAll('input[type="text"], input[type="search"]')]
        .find(i => i.offsetParent !== null && i.placeholder?.includes('busca'));
    });
    if (!inputHandle || !(await inputHandle.asElement())) {
      throw new Error('No se encontró el campo de búsqueda en Digitalife.');
    }
    await inputHandle.asElement().focus();
    await page.keyboard.type(product, { delay: 50 });
    await page.keyboard.press('Enter');

    await page.waitForFunction((b) => location.href !== b, { timeout: 12000 }, homeUrl).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 12000 }).catch(() => {});

    console.log(`[DL] URL: ${await page.url()}`);

    // Intentar parseHTML del DOM renderizado
    const html   = await page.content();
    const parsed = parseHTML(html, product);
    if (parsed.length > 0) {
      console.log(`[DL] ${parsed.length} productos vía DOM`);
      return parsed;
    }

    if (captured.length > 0) {
      const norm  = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const words = norm(product).split(/\s+/).filter(w => w.length > 2);
      const seen  = new Set();
      const unique = captured.filter(item => {
        const key = item.url ?? item.permalink ?? item.title ?? item.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const formatted = unique.map(item => ({
        name : item.title ?? item.name ?? item.nombre ?? '—',
        price: formatPrice(item.price ?? item.precio ?? item.sale_price ?? item.finalPrice),
        url  : item.url ?? item.permalink ?? item.link ?? null,
      })).filter(it => it.price && it.price !== 'NaN' && it.name !== '—');
      const relevant = formatted.filter(it => words.some(w => norm(it.name).includes(w)));
      console.log(`[DL] API: ${relevant.length}/${formatted.length} relevantes`);
      return (relevant.length > 0 ? relevant : formatted).slice(0, 8);
    }

    return [];
  } finally {
    await page.close();
  }
}

// ── Sitios Nuxt/SPA genéricos con Cloudflare ─────────────────
async function scrapeWithInterception(searchUrl, product) {
  const page = await newPage();
  const captured = [];

  page.on('response', async (resp) => {
    try {
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const json = await resp.json();
      const found = findProductArrays(json);
      if (found.length > 0) captured.push(...found);
    } catch {}
  });

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 12000 }).catch(() => {});

    const dbg = await page.evaluate(() => ({ title: document.title, url: location.href, bodyLen: document.body?.innerHTML?.length || 0 }));
    console.log(`[intercept] página: ${dbg.title} | ${dbg.url} | ${dbg.bodyLen} chars`);

    // Intentar parseHTML del DOM renderizado
    const html   = await page.content();
    const parsed = parseHTML(html, product);
    if (parsed.length > 0) {
      console.log(`[intercept] ${parsed.length} productos vía parseHTML`);
      return parsed;
    }

    // Fallback: JSON capturado de las respuestas API
    if (captured.length > 0) {
      const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const words = norm(product).split(/\s+/).filter(w => w.length > 2);
      const seen  = new Set();
      const unique = captured.filter(item => {
        const key = item.url ?? item.permalink ?? item.title ?? item.name;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const formatted = unique.map(item => ({
        name : item.title ?? item.name ?? item.nombre ?? '—',
        price: formatPrice(item.price ?? item.precio ?? item.sale_price ?? item.finalPrice),
        url  : item.url ?? item.permalink ?? item.link ?? null,
      })).filter(it => it.price && it.price !== 'NaN' && it.name !== '—');
      const relevant = formatted.filter(it => words.some(w => norm(it.name).includes(w)));
      console.log(`[intercept] ${relevant.length}/${formatted.length} relevantes`);
      return (relevant.length > 0 ? relevant : formatted).slice(0, 8);
    }

    return [];
  } finally {
    await page.close();
  }
}

// ── Endpoint de scraping ──────────────────────────────────────
app.get('/api/scrape', async (req, res) => {
  const { url: supplierUrl, q: product } = req.query;

  if (!supplierUrl || !product) {
    return res.status(400).json({ error: 'Parámetros requeridos: url, q' });
  }

  // Validar esquema de URL
  try {
    const { protocol } = new URL(supplierUrl);
    if (!['http:', 'https:'].includes(protocol)) {
      return res.status(400).json({ error: 'URL inválida.' });
    }
  } catch {
    return res.status(400).json({ error: 'URL inválida.' });
  }

  let host = '';
  try { host = new URL(supplierUrl).hostname; } catch {}

  try {
    let items;

    if (host.includes('cyberpuerta')) {
      // Cyberpuerta: SPA pura — interactuar con formulario
      console.log(`[scrape] ${host} → Cyberpuerta form search`);
      items = await scrapeCyberpuerta(product);

    } else if (host.includes('digitalife') || host.includes('ditalife')) {
      // Digitalife: Cloudflare + SPA — buscar desde homepage
      console.log(`[scrape] ${host} → Digitalife form search`);
      items = await scrapeDigitalife(product);

    } else {
      const searchUrl = buildSearchUrl(supplierUrl, product);
      const needsJS   = JS_REQUIRED_HOSTS.some(h => host.includes(h));
      console.log(`[scrape] ${host} → ${searchUrl} (${needsJS ? 'puppeteer+intercept' : 'axios'})`);

      if (needsJS) {
        // SPAs con Cloudflare o JS pesado: intercepción de API + DOM
        items = await scrapeWithInterception(searchUrl, product);
      } else {
        const response = await axios.get(searchUrl, {
          headers    : { ...BROWSER_HEADERS, 'Referer': supplierUrl, 'Host': new URL(searchUrl).hostname },
          timeout    : 20000,
          maxRedirects: 5,
          decompress : true,
        });
        console.log(`[scrape] ${host}: ${response.data.length} chars`);
        items = parseHTML(response.data, product);
      }
    }

    res.json({ items, error: null });
  } catch (e) {
    const status  = e.response?.status;
    let   message = e.message || 'Error desconocido';

    if (status === 404) {
      message = 'URL no encontrada (404). Actualice la URL del proveedor con la ruta correcta de búsqueda (use {q} como marcador).';
    } else if (status >= 500) {
      message = 'El sitio del proveedor tuvo un error interno (500). Intente más tarde o actualice la URL de búsqueda del proveedor.';
    } else if (status === 403) {
      if (host.includes('mercadolibre')) {
        message = 'MercadoLibre bloqueó la consulta. Verifique que su app tenga permiso de búsqueda habilitado en developers.mercadolibre.com.mx.';
      } else {
        message = 'El sitio rechazó la consulta (403). Intente más tarde o consulte manualmente.';
      }
    } else if (status === 429) {
      message = 'Demasiadas consultas al sitio. Espere unos minutos e intente de nuevo.';
    } else if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
      message = 'No se pudo conectar al sitio del proveedor.';
    } else if (e.code === 'ECONNABORTED' || message.includes('timeout') || message.includes('Timeout')) {
      message = 'El sitio tardó demasiado en responder (timeout).';
    }

    console.error(`[scrape] Error ${host}: ${message}`);
    res.json({ items: [], error: message });
  }
});

// ── Endpoint de salud ─────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`\nWebscraper de Proveedores`);
  console.log(`══════════════════════════`);
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`Abra esa URL en su navegador\n`);
});

async function shutdown() {
  if (browser) await browser.close().catch(() => {});
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
