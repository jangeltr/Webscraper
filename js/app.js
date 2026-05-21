/* ============================================================
   Webscraper de Proveedores — app.js
   Datos persistidos en localStorage del navegador.
   ============================================================ */

'use strict';

// ── Storage keys ──────────────────────────────────────────────
const KEYS = {
  categories: 'wscraper_categories',
  suppliers: 'wscraper_suppliers',
};

// ── Storage helpers ───────────────────────────────────────────
const Store = {
  getCategories: () => JSON.parse(localStorage.getItem(KEYS.categories) || '[]'),
  setCategories: (data) => localStorage.setItem(KEYS.categories, JSON.stringify(data)),
  getSuppliers: () => JSON.parse(localStorage.getItem(KEYS.suppliers) || '[]'),
  setSuppliers: (data) => localStorage.setItem(KEYS.suppliers, JSON.stringify(data)),
  newId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
};

// ── HTML escaping ─────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

// ── Toast notifications ───────────────────────────────────────
const Toast = (() => {
  const el = document.getElementById('toastMsg');
  const body = document.getElementById('toastBody');
  const instance = bootstrap.Toast.getOrCreateInstance(el, { delay: 3000 });
  return {
    show(msg, type = 'success') {
      el.className = `toast align-items-center border-0 text-bg-${type}`;
      body.textContent = msg;
      instance.show();
    },
  };
})();

// ── Confirm-delete modal ──────────────────────────────────────
const DeleteModal = (() => {
  const modal = new bootstrap.Modal(document.getElementById('modalDelete'));
  const bodyEl = document.getElementById('modalDeleteBody');
  const btn = document.getElementById('btnConfirmDelete');
  let _cb = null;

  btn.addEventListener('click', () => {
    _cb?.();
    _cb = null;
    modal.hide();
  });

  return {
    confirm(message, callback) {
      bodyEl.textContent = message;
      _cb = callback;
      modal.show();
    },
  };
})();

// ══════════════════════════════════════════════════════════════
// MÓDULO: Categorías
// ══════════════════════════════════════════════════════════════
const CategoriesModule = (() => {
  let editingId = null;

  const form = document.getElementById('formCategoria');
  const fldId = document.getElementById('catId');
  const fldNombre = document.getElementById('catNombre');
  const fldDesc = document.getElementById('catDescripcion');
  const formTitle = document.getElementById('formCatTitle');
  const btnCancel = document.getElementById('btnCatCancel');
  const tbody = document.getElementById('tbodyCategorias');
  const emptyEl = document.getElementById('emptyCat');
  const countEl = document.getElementById('catCount');

  function resetForm() {
    form.classList.remove('was-validated');
    fldId.value = '';
    fldNombre.value = '';
    fldDesc.value = '';
    formTitle.textContent = 'Nueva Categoría';
    btnCancel.style.display = 'none';
    editingId = null;
  }

  function render() {
    const cats = Store.getCategories();
    countEl.textContent = cats.length;

    if (cats.length === 0) {
      tbody.innerHTML = '';
      emptyEl.style.display = 'block';
      refreshDropdowns();
      return;
    }

    emptyEl.style.display = 'none';
    tbody.innerHTML = cats.map((c) => `
      <tr>
        <td><code class="text-secondary">${esc(c.id.slice(-5).toUpperCase())}</code></td>
        <td class="fw-medium">${esc(c.nombre)}</td>
        <td class="text-muted small">${esc(c.descripcion) || '<em>—</em>'}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-primary btn-action me-1"
            title="Editar" onclick="CategoriesModule.edit('${c.id}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-action"
            title="Eliminar" onclick="CategoriesModule.remove('${c.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`).join('');

    refreshDropdowns();
  }

  function refreshDropdowns() {
    const cats = Store.getCategories();
    const opts = cats.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

    // Proveedor form
    const pSel = document.getElementById('provCategoria');
    const pVal = pSel.value;
    pSel.innerHTML = `<option value="">— Seleccione —</option>${opts}`;
    if (pVal) pSel.value = pVal;

    // Search filter
    const sSel = document.getElementById('searchCategory');
    const sVal = sSel.value;
    sSel.innerHTML = `<option value="">Todas las categorías</option>${opts}`;
    if (sVal) sSel.value = sVal;
  }

  function save() {
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    const nombre = fldNombre.value.trim();
    const descripcion = fldDesc.value.trim();
    const cats = Store.getCategories();

    if (editingId) {
      const idx = cats.findIndex((c) => c.id === editingId);
      if (idx >= 0) cats[idx] = { id: editingId, nombre, descripcion };
      Toast.show('Categoría actualizada correctamente.');
    } else {
      cats.push({ id: Store.newId(), nombre, descripcion });
      Toast.show('Categoría guardada correctamente.');
    }

    Store.setCategories(cats);
    resetForm();
    render();
    SuppliersModule.render();
  }

  function edit(id) {
    const cat = Store.getCategories().find((c) => c.id === id);
    if (!cat) return;
    editingId = id;
    fldId.value = id;
    fldNombre.value = cat.nombre;
    fldDesc.value = cat.descripcion || '';
    formTitle.textContent = 'Editar Categoría';
    btnCancel.style.display = 'inline-block';
    form.classList.remove('was-validated');
    document.getElementById('pane-categorias').querySelector('.card').scrollIntoView({ behavior: 'smooth' });
  }

  function remove(id) {
    const cat = Store.getCategories().find((c) => c.id === id);
    const linkedSuppliers = Store.getSuppliers().filter((s) => s.categoriaId === id);
    let msg = `¿Eliminar la categoría "${cat?.nombre}"?`;
    if (linkedSuppliers.length > 0) {
      msg += ` También se eliminarán ${linkedSuppliers.length} proveedor(es) vinculado(s).`;
    }
    DeleteModal.confirm(msg, () => {
      Store.setCategories(Store.getCategories().filter((c) => c.id !== id));
      if (linkedSuppliers.length > 0) {
        Store.setSuppliers(Store.getSuppliers().filter((s) => s.categoriaId !== id));
      }
      Toast.show('Categoría eliminada.', 'danger');
      render();
      SuppliersModule.render();
    });
  }

  function init() {
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    btnCancel.addEventListener('click', resetForm);
    render();
  }

  return { init, render, edit, remove, refreshDropdowns };
})();

// ══════════════════════════════════════════════════════════════
// MÓDULO: Proveedores
// ══════════════════════════════════════════════════════════════
const SuppliersModule = (() => {
  let editingId = null;

  const form = document.getElementById('formProveedor');
  const fldId = document.getElementById('provId');
  const fldCat = document.getElementById('provCategoria');
  const fldNombre = document.getElementById('provNombre');
  const fldContacto = document.getElementById('provContacto');
  const fldEmail = document.getElementById('provEmail');
  const fldTelefono = document.getElementById('provTelefono');
  const fldUrl = document.getElementById('provUrl');
  const formTitle = document.getElementById('formProvTitle');
  const btnCancel = document.getElementById('btnProvCancel');
  const tbody = document.getElementById('tbodyProveedores');
  const emptyEl = document.getElementById('emptyProv');
  const countEl = document.getElementById('provCount');

  function resetForm() {
    form.classList.remove('was-validated');
    [fldId, fldNombre, fldContacto, fldEmail, fldTelefono, fldUrl].forEach((f) => (f.value = ''));
    fldCat.value = '';
    formTitle.textContent = 'Nuevo Proveedor';
    btnCancel.style.display = 'none';
    editingId = null;
  }

  function render() {
    const supps = Store.getSuppliers();
    const cats = Store.getCategories();
    countEl.textContent = supps.length;

    if (supps.length === 0) {
      tbody.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    tbody.innerHTML = supps.map((s) => {
      const cat = cats.find((c) => c.id === s.categoriaId);
      return `
        <tr>
          <td class="fw-medium">${esc(s.nombre)}</td>
          <td><span class="badge bg-info text-dark">${esc(cat?.nombre ?? '—')}</span></td>
          <td class="small">${esc(s.contacto) || '—'}</td>
          <td class="small">${s.email
            ? `<a href="mailto:${esc(s.email)}" class="text-decoration-none">${esc(s.email)}</a>`
            : '—'}</td>
          <td class="small">${esc(s.telefono) || '—'}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary btn-action me-1"
              title="Editar" onclick="SuppliersModule.edit('${s.id}')">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-action"
              title="Eliminar" onclick="SuppliersModule.remove('${s.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function save() {
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;

    let rawUrl = fldUrl.value.trim();
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }

    const record = {
      id: editingId || Store.newId(),
      categoriaId: fldCat.value,
      nombre: fldNombre.value.trim(),
      contacto: fldContacto.value.trim(),
      email: fldEmail.value.trim(),
      telefono: fldTelefono.value.trim(),
      url: rawUrl,
    };

    const supps = Store.getSuppliers();
    if (editingId) {
      const idx = supps.findIndex((s) => s.id === editingId);
      if (idx >= 0) supps[idx] = record;
      Toast.show('Proveedor actualizado correctamente.');
    } else {
      supps.push(record);
      Toast.show('Proveedor guardado correctamente.');
    }

    Store.setSuppliers(supps);
    resetForm();
    render();
  }

  function edit(id) {
    // Refresh dropdowns before setting value
    CategoriesModule.refreshDropdowns();

    const s = Store.getSuppliers().find((s) => s.id === id);
    if (!s) return;
    editingId = id;
    fldId.value = s.id;
    fldCat.value = s.categoriaId;
    fldNombre.value = s.nombre;
    fldContacto.value = s.contacto || '';
    fldEmail.value = s.email || '';
    fldTelefono.value = s.telefono || '';
    fldUrl.value = s.url;
    formTitle.textContent = 'Editar Proveedor';
    btnCancel.style.display = 'inline-block';
    form.classList.remove('was-validated');
    document.getElementById('pane-proveedores').querySelector('.card').scrollIntoView({ behavior: 'smooth' });
  }

  function remove(id) {
    const s = Store.getSuppliers().find((s) => s.id === id);
    DeleteModal.confirm(`¿Eliminar al proveedor "${s?.nombre}"?`, () => {
      Store.setSuppliers(Store.getSuppliers().filter((s) => s.id !== id));
      Toast.show('Proveedor eliminado.', 'danger');
      render();
    });
  }

  const API_PROVIDERS = [];

  function seedApiSuppliers() {
    const cats = Store.getCategories();
    if (cats.length === 0) {
      Toast.show('Primero agrega al menos una categoría.', 'warning');
      return;
    }

    const existing = Store.getSuppliers();
    const toAdd    = [];

    cats.forEach((cat) => {
      API_PROVIDERS.forEach((prov) => {
        const alreadyExists = existing.some(
          (s) => s.categoriaId === cat.id && s.url.includes(prov.tag)
        );
        if (!alreadyExists) {
          toAdd.push({
            id         : Store.newId(),
            categoriaId: cat.id,
            nombre     : prov.nombre,
            contacto   : prov.contacto,
            email      : prov.email,
            telefono   : prov.telefono,
            url        : prov.url,
          });
        }
      });
    });

    if (toAdd.length === 0) {
      Toast.show('Los proveedores con API ya estaban registrados en todas las categorías.', 'warning');
      return;
    }

    Store.setSuppliers([...existing, ...toAdd]);
    render();
    Toast.show(`Se agregaron ${toAdd.length} proveedor(es) con API libre.`);
  }

  function init() {
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    btnCancel.addEventListener('click', resetForm);
    document.getElementById('btnSeedProviders').addEventListener('click', seedApiSuppliers);
    render();
  }

  return { init, render, edit, remove };
})();

// ── Parsea precio a número (ej. "$18,125.00 MXN" → 18125) ────
function parsePrice(str) {
  const m = String(str || '').match(/[\d,]+(?:\.\d+)?/);
  if (!m) return NaN;
  return parseFloat(m[0].replace(/,/g, ''));
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: Scraper — llama al servidor local /api/scrape
// ══════════════════════════════════════════════════════════════
const Scraper = (() => {

  // Genera URL de búsqueda (solo para el enlace manual en filas de error)
  function buildSearchUrl(baseUrl, product) {
    try {
      if (/\{q\}/i.test(baseUrl)) return baseUrl.replace(/\{q\}/gi, encodeURIComponent(product));
      const url = new URL(baseUrl);
      if (url.hostname.includes('mercadolibre')) {
        return `https://www.mercadolibre.com.mx/jm/search?as_word=${encodeURIComponent(product)}`;
      }
      url.searchParams.set('q', product);
      return url.toString();
    } catch { return baseUrl; }
  }

  async function scrape(supplierUrl, product) {
    const apiUrl = `/api/scrape?url=${encodeURIComponent(supplierUrl)}&q=${encodeURIComponent(product)}`;
    const ctrl   = new AbortController();
    const timer  = setTimeout(() => ctrl.abort(), 35000);
    try {
      const res = await fetch(apiUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Error del servidor: HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return { items: data.items };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('La consulta tardó demasiado (timeout).');
      throw e;
    }
  }

  return { scrape, buildSearchUrl };
})();

// ══════════════════════════════════════════════════════════════
// MÓDULO: Búsqueda
// ══════════════════════════════════════════════════════════════
const SearchModule = (() => {

  // Inserta filas de resultado en tbody; una fila por producto encontrado
  function insertErrorRow(tbody, supplier, cat, message, product) {
    const searchLink = esc(Scraper.buildSearchUrl(supplier.url, product || ''));
    const tr = document.createElement('tr');
    tr.classList.add('table-warning');
    tr.innerHTML = `
      <td class="fw-semibold">${esc(supplier.nombre)}</td>
      <td><span class="badge bg-info text-dark">${esc(cat?.nombre ?? '—')}</span></td>
      <td class="small">${esc(supplier.contacto) || '—'}</td>
      <td colspan="2" class="text-muted small"><i class="bi bi-exclamation-triangle me-1"></i>${esc(message)}</td>
      <td class="text-center">
        <a href="${searchLink}" target="_blank" rel="noopener"
          title="Buscar manualmente"
          class="btn btn-sm btn-outline-secondary"><i class="bi bi-box-arrow-up-right"></i></a>
      </td>`;
    tbody.appendChild(tr);
  }

  function renderSpinnerRow(s, cat) {
    return `
      <tr id="srow-${s.id}">
        <td class="fw-semibold">${esc(s.nombre)}</td>
        <td><span class="badge bg-info text-dark">${esc(cat?.nombre ?? '—')}</span></td>
        <td class="small">${esc(s.contacto) || '—'}</td>
        <td colspan="2" class="text-muted small">
          <span class="spinner-border spinner-border-sm text-primary me-1"></span>
          Consultando sitio<span class="dots-anim">...</span>
        </td>
        <td>—</td>
      </tr>`;
  }

  let _searchData = []; // [{supplier, cat, items, error, product}]

  async function search() {
    const product     = document.getElementById('searchProduct').value.trim();
    const categoryId  = document.getElementById('searchCategory').value;

    if (!product) {
      Toast.show('Ingrese el nombre del producto a buscar.', 'warning');
      document.getElementById('searchProduct').focus();
      return;
    }

    const resultsEl   = document.getElementById('searchResults');
    const noResultsEl = document.getElementById('noResults');
    const tbody       = document.getElementById('resultsBody');

    let supps = Store.getSuppliers();
    const cats = Store.getCategories();
    if (categoryId) supps = supps.filter((s) => s.categoriaId === categoryId);

    // Evitar consultar el mismo sitio web más de una vez (mismo hostname en varias categorías)
    const seenHosts = new Set();
    supps = supps.filter(s => {
      try {
        const h = new URL(s.url).hostname;
        if (seenHosts.has(h)) return false;
        seenHosts.add(h);
        return true;
      } catch { return true; }
    });

    document.getElementById('searchQuery').textContent = `"${product}"`;

    if (supps.length === 0) {
      resultsEl.classList.add('d-none');
      noResultsEl.classList.remove('d-none');
      return;
    }

    noResultsEl.classList.add('d-none');
    resultsEl.classList.remove('d-none');
    document.getElementById('resultsCount').textContent =
      `${supps.length} proveedor${supps.length !== 1 ? 'es' : ''}`;

    // Resetear datos y filtros de la búsqueda anterior
    _searchData = [];
    document.getElementById('filterPriceMin').value = '';
    document.getElementById('filterPriceMax').value = '';

    // Mostrar filas con spinner por cada proveedor
    tbody.innerHTML = supps.map((s) => {
      const cat = cats.find((c) => c.id === s.categoriaId);
      return renderSpinnerRow(s, cat);
    }).join('');

    // Consultar todos en paralelo; acumular resultados y quitar spinner al terminar
    await Promise.allSettled(
      supps.map(async (s) => {
        const cat     = cats.find((c) => c.id === s.categoriaId);
        const spinRow = document.getElementById(`srow-${s.id}`);
        try {
          const { items } = await Scraper.scrape(s.url, product);
          _searchData.push({ supplier: s, cat, items, error: null, product });
        } catch (err) {
          const msg = err.message || 'No se pudo acceder al sitio. Use el enlace para buscar manualmente.';
          _searchData.push({ supplier: s, cat, items: [], error: msg, product });
        } finally {
          spinRow?.remove();
        }
      })
    );

    renderFilteredResults();
  }

  const _rowDataMap = new Map(); // rowId → datos del producto para guardar

  function renderFilteredResults() {
    const minVal   = document.getElementById('filterPriceMin').value;
    const maxVal   = document.getElementById('filterPriceMax').value;
    const min      = minVal !== '' ? parseFloat(minVal) : -Infinity;
    const max      = maxVal !== '' ? parseFloat(maxVal) :  Infinity;
    const hasFilter = minVal !== '' || maxVal !== '';

    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    _rowDataMap.clear();
    document.getElementById('checkAll').checked = false;
    document.getElementById('btnAddInterests').disabled = true;

    // Aplanar y filtrar todos los ítems de todos los proveedores
    const flatItems = [];
    _searchData.forEach(({ supplier, cat, items, product: searchTerm }) => {
      if (!items || items.length === 0) return;
      items.forEach(item => {
        const p = parsePrice(item.price);
        if (!hasFilter || isNaN(p) || (p >= min && p <= max)) {
          flatItems.push({ supplier, cat, item, searchTerm });
        }
      });
    });

    // Ordenar por precio ascendente
    flatItems.sort((a, b) => {
      const pa = parsePrice(a.item.price);
      const pb = parsePrice(b.item.price);
      if (isNaN(pa) && isNaN(pb)) return 0;
      if (isNaN(pa)) return 1;
      if (isNaN(pb)) return -1;
      return pa - pb;
    });

    // Renderizar ítems ordenados con checkbox
    flatItems.forEach(({ supplier, cat, item, searchTerm }) => {
      const rowId = Store.newId();
      _rowDataMap.set(rowId, {
        id         : rowId,
        name       : item.name,
        price      : item.price,
        url        : item.url || null,
        supplierName: supplier.nombre,
        supplierUrl : supplier.url,
        catName    : cat?.nombre ?? '',
        searchTerm,
        savedAt    : Date.now(),
      });

      const nameCell = item.url
        ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="text-decoration-none">${esc(item.name)}</a>`
        : esc(item.name);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center align-middle">
          <input type="checkbox" class="form-check-input result-check" data-id="${rowId}">
        </td>
        <td class="fw-semibold align-middle">${esc(supplier.nombre)}</td>
        <td class="align-middle"><span class="badge bg-info text-dark">${esc(cat?.nombre ?? '—')}</span></td>
        <td class="align-middle small">${esc(supplier.contacto) || '—'}</td>
        <td class="align-middle">${nameCell}</td>
        <td class="text-end align-middle fw-bold text-success">${esc(item.price)}</td>
        <td class="text-center align-middle">
          ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-success"><i class="bi bi-cart"></i></a>` : '—'}
        </td>`;
      tbody.appendChild(tr);
    });

    // Proveedores con ítems pero ninguno en el rango (solo cuando hay filtro activo)
    if (hasFilter) {
      _searchData.forEach(({ supplier, cat, items, error }) => {
        if (error || !items || items.length === 0) return;
        const anyMatch = items.some(item => {
          const p = parsePrice(item.price);
          return isNaN(p) || (p >= min && p <= max);
        });
        if (!anyMatch) {
          insertErrorRow(tbody, supplier, cat,
            `Sin resultados en este rango (${items.length} producto${items.length !== 1 ? 's' : ''} fuera del rango).`,
            '');
        }
      });
    }

    // Filas de error (proveedores que fallaron)
    _searchData.forEach(({ supplier, cat, error, product: prod }) => {
      if (!error) return;
      insertErrorRow(tbody, supplier, cat, error, prod || '');
    });

    // Actualizar contador
    const productRows = tbody.querySelectorAll('tr:not(.table-warning)').length;
    const hasFilterLabel = hasFilter ? ' (filtrado)' : '';
    document.getElementById('resultsCount').textContent =
      `${productRows} resultado${productRows !== 1 ? 's' : ''}${hasFilterLabel}`;
  }

  function updateAddButton() {
    const any = document.querySelector('#resultsBody .result-check:checked');
    document.getElementById('btnAddInterests').disabled = !any;
  }

  function init() {
    document.getElementById('btnSearch').addEventListener('click', search);
    document.getElementById('searchProduct').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') search();
    });
    document.getElementById('filterPriceMin').addEventListener('input', renderFilteredResults);
    document.getElementById('filterPriceMax').addEventListener('input', renderFilteredResults);
    document.getElementById('btnClearPriceFilter').addEventListener('click', () => {
      document.getElementById('filterPriceMin').value = '';
      document.getElementById('filterPriceMax').value = '';
      renderFilteredResults();
    });

    // Checkbox "seleccionar todos"
    document.getElementById('checkAll').addEventListener('change', (e) => {
      document.querySelectorAll('#resultsBody .result-check').forEach(cb => {
        cb.checked = e.target.checked;
      });
      updateAddButton();
    });

    // Actualizar botón al marcar/desmarcar filas individuales
    document.getElementById('resultsBody').addEventListener('change', (e) => {
      if (e.target.classList.contains('result-check')) {
        const all  = document.querySelectorAll('#resultsBody .result-check');
        const checked = document.querySelectorAll('#resultsBody .result-check:checked');
        document.getElementById('checkAll').checked = all.length === checked.length;
        updateAddButton();
      }
    });

    // Guardar seleccionados en Interesantes
    document.getElementById('btnAddInterests').addEventListener('click', () => {
      const checked = [...document.querySelectorAll('#resultsBody .result-check:checked')];
      const products = checked.map(cb => _rowDataMap.get(cb.dataset.id)).filter(Boolean);
      const added = InterestsModule.add(products);
      checked.forEach(cb => { cb.checked = false; });
      document.getElementById('checkAll').checked = false;
      updateAddButton();
      if (added > 0) {
        Toast.show(`${added} producto${added !== 1 ? 's' : ''} guardado${added !== 1 ? 's' : ''} en Interesantes.`);
      } else {
        Toast.show('Esos productos ya estaban en tu lista de Interesantes.', 'warning');
      }
    });
  }

  return { init };
})();

// ══════════════════════════════════════════════════════════════
// MÓDULO: Interesantes
// ══════════════════════════════════════════════════════════════
const InterestsModule = (() => {
  const KEY = 'wscraper_interests';

  const getAll  = ()       => JSON.parse(localStorage.getItem(KEY) || '[]');
  const saveAll = (items)  => localStorage.setItem(KEY, JSON.stringify(items));

  function updateBadge() {
    const n = getAll().length;
    const badge = document.getElementById('interestCount');
    badge.textContent = n;
    badge.style.display = n > 0 ? '' : 'none';
  }

  function render() {
    const items   = getAll();
    const tbody   = document.getElementById('tbodyInterests');
    const emptyEl = document.getElementById('emptyInterests');
    updateBadge();

    if (items.length === 0) {
      tbody.innerHTML   = '';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';
    tbody.innerHTML = items.map(p => `
      <tr id="irow-${p.id}">
        <td class="align-middle">
          ${p.url
            ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" class="text-decoration-none fw-medium">${esc(p.name)}</a>`
            : `<span class="fw-medium">${esc(p.name)}</span>`}
          <div class="text-muted small">${esc(p.searchTerm)}</div>
        </td>
        <td class="align-middle small">${esc(p.supplierName)}</td>
        <td class="align-middle">
          ${p.catName ? `<span class="badge bg-info text-dark">${esc(p.catName)}</span>` : '—'}
        </td>
        <td class="text-end align-middle fw-bold text-success">${esc(p.price)}</td>
        <td class="text-end align-middle" id="uprice-${p.id}">—</td>
        <td class="text-center align-middle">
          <button class="btn btn-sm btn-outline-danger btn-action"
            onclick="InterestsModule.remove('${p.id}')" title="Quitar de la lista">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`).join('');
  }

  function add(products) {
    const existing = getAll();
    const toAdd = products.filter(p =>
      !existing.some(e => e.url ? e.url === p.url : e.name === p.name && e.supplierUrl === p.supplierUrl)
    );
    if (toAdd.length > 0) saveAll([...existing, ...toAdd]);
    render();
    return toAdd.length;
  }

  function remove(id) {
    saveAll(getAll().filter(p => p.id !== id));
    render();
    Toast.show('Producto quitado de Interesantes.', 'warning');
  }

  async function refreshPrices() {
    const items = getAll();
    if (items.length === 0) { Toast.show('No hay productos guardados.', 'warning'); return; }

    const btn = document.getElementById('btnRefreshInterests');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Actualizando...';

    await Promise.allSettled(items.map(async (p) => {
      const cell = document.getElementById(`uprice-${p.id}`);
      if (!cell) return;
      cell.innerHTML = '<span class="spinner-border spinner-border-sm text-primary"></span>';
      try {
        const res  = await fetch(`/api/scrape?url=${encodeURIComponent(p.supplierUrl)}&q=${encodeURIComponent(p.searchTerm)}`);
        const data = await res.json();
        const match = data.items?.find(r => r.url && r.url === p.url) ?? data.items?.[0];
        if (match) {
          const pSaved   = parsePrice(p.price);
          const pNew     = parsePrice(match.price);
          const changed  = match.price !== p.price;
          const down     = pNew < pSaved;
          cell.innerHTML = changed
            ? `<span class="fw-bold ${down ? 'text-success' : 'text-danger'}">${esc(match.price)} ${down ? '↓' : '↑'}</span>`
            : `<span class="text-muted">${esc(match.price)}</span>`;
        } else {
          cell.textContent = 'Sin datos';
        }
      } catch {
        cell.textContent = 'Error';
      }
    }));

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Actualizar precios';
  }

  function init() {
    document.getElementById('btnRefreshInterests').addEventListener('click', refreshPrices);
    document.getElementById('btnClearInterests').addEventListener('click', () => {
      if (getAll().length === 0) return;
      DeleteModal.confirm('¿Limpiar toda la lista de Interesantes?', () => {
        saveAll([]);
        render();
        Toast.show('Lista de Interesantes limpiada.', 'warning');
      });
    });
    render();
  }

  return { init, add, remove, updateBadge };
})();

// ══════════════════════════════════════════════════════════════
// Bootstrap
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  CategoriesModule.init();
  SuppliersModule.init();
  SearchModule.init();
  InterestsModule.init();

  // Refrescar dropdowns al cambiar de pestaña
  document.getElementById('tab-proveedores').addEventListener('shown.bs.tab', () => {
    CategoriesModule.refreshDropdowns();
  });
  document.getElementById('tab-principal').addEventListener('shown.bs.tab', () => {
    CategoriesModule.refreshDropdowns();
  });
});
