# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Web scraper for government procurement in Mexico. Compares prices across supplier websites for categories like Papelería, Equipo de cómputo, Electricidad, and Equipo de Oficina. Users register suppliers and categories in the UI; a search triggers server-side scraping and returns price comparisons.

## Architecture

**Server**: `server.js` — Express on port 3000. Serves static files + REST API.  
**Frontend**: `index.html` + `js/app.js` + `css/styles.css` — vanilla JS SPA with Bootstrap 5.  
**Data**: In-memory only (categories and suppliers stored in browser `localStorage`).

### API Endpoint

`GET /api/scrape?url=SUPPLIER_URL&q=SEARCH_TERM`

Routes to one of three strategies based on hostname:

1. **Cyberpuerta** → `scrapeCyberpuerta()`: Puppeteer on `cyberpuerta.mx`, uses homepage search bar, intercepts JSON API responses, filters by search term relevance.
2. **MercadoLibre** → `scrapeML()`: tries `api.mercadolibre.com` (needs auth), fails gracefully — ML blocks server IPs.
3. **Everything else** → axios + cheerio `parseHTML()`, or Puppeteer for JS-heavy sites.

### Scraping Stack

- `axios` — HTTP client for non-JS sites; uses browser-like headers (`BROWSER_HEADERS`)
- `cheerio` — server-side HTML parsing for static/SSR pages
- `puppeteer-core` — headless Chrome for SPAs; shared browser instance via `getBrowser()`; anti-detection via `navigator.webdriver = undefined`
- Chrome path: auto-detected at `/usr/bin/google-chrome`

### Key Implementation Notes

**Cyberpuerta** is a Nuxt.js SPA. Direct URL navigation to category pages returns empty DOM (categories load asynchronously). The working approach: navigate to `cyberpuerta.mx`, use the search form (`.cp-search-bar__input-text` + `.cp-button-icon`), intercept JSON API responses via `page.on('response', ...)`, filter by relevance to the query, deduplicate by URL.

**MercadoLibre** blocks server IPs with an `account-verification` challenge that cannot be bypassed from a datacenter IP. The official API at `api.mercadolibre.com` also returns 403 without OAuth credentials. Register an app at developers.mercadolibre.com for API access.

**`parseHTML()`** tries 11 strategies in order: JSON-LD, `__NEXT_DATA__`, `__NUXT_DATA__`, embedded JSON scripts, regex, microdata, Open Graph, OpenCart, PrestaShop, WooCommerce/generic, price fallback. Applies query-relevance filtering at the end.

**`buildSearchUrl()`** on the server has hardcoded patterns for cyberpuerta, digitalife, lumen.mx, amazon, walmart, liverpool, elektra, costco, staples, officemax. Users can also configure `{q}` templates in the provider URL field.

## Dev Commands

```bash
npm start          # production
npm run dev        # watch mode (node --watch)
```

Server logs to stdout. Run and open `http://localhost:3000`.
