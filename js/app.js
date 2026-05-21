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

  // Proveedores con API pública libre (sin autenticación)
  const API_PROVIDERS = [
    {
      nombre  : 'MercadoLibre México',
      contacto: 'Atención a vendedores',
      email   : 'ayuda@mercadolibre.com.mx',
      telefono: '800 900 0900',
      url     : 'https://www.mercadolibre.com.mx',
      tag     : 'mercadolibre.com',
    },
  ];

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
  function insertResultRows(tbody, supplier, cat, items) {
    const suppName = esc(supplier.nombre);
    const catBadge = `<span class="badge bg-info text-dark">${esc(cat?.nombre ?? '—')}</span>`;
    const contact  = esc(supplier.contacto) || '—';

    items.forEach((item, i) => {
      const nameCell = item.url
        ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="text-decoration-none">${esc(item.name)}</a>`
        : esc(item.name);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-semibold align-middle">${i === 0 ? suppName : '<span class="text-muted small">↑ mismo</span>'}</td>
        <td class="align-middle">${i === 0 ? catBadge : ''}</td>
        <td class="align-middle small">${i === 0 ? contact : ''}</td>
        <td class="align-middle">${nameCell}</td>
        <td class="text-end align-middle fw-bold text-success">${esc(item.price)}</td>
        <td class="text-center align-middle">
          ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-success"><i class="bi bi-cart"></i></a>` : '—'}
        </td>`;
      tbody.appendChild(tr);
    });
  }

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

    // Mostrar filas con spinner por cada proveedor
    tbody.innerHTML = supps.map((s) => {
      const cat = cats.find((c) => c.id === s.categoriaId);
      return renderSpinnerRow(s, cat);
    }).join('');

    // Consultar todos en paralelo; reemplazar fila spinner al terminar cada uno
    await Promise.allSettled(
      supps.map(async (s) => {
        const cat     = cats.find((c) => c.id === s.categoriaId);
        const spinRow = document.getElementById(`srow-${s.id}`);
        try {
          const { items } = await Scraper.scrape(s.url, product);
          spinRow?.remove();
          if (items.length > 0) {
            insertResultRows(tbody, s, cat, items);
          } else {
            insertErrorRow(tbody, s, cat, 'El sitio respondió pero no se encontraron precios. Use el enlace para buscar manualmente.', product);
          }
        } catch (err) {
          spinRow?.remove();
          insertErrorRow(tbody, s, cat, err.message || 'No se pudo acceder al sitio. Use el enlace para buscar manualmente.', product);
        }
      })
    );

    // Actualizar contador con total de filas de resultado
    const totalRows = tbody.querySelectorAll('tr').length;
    document.getElementById('resultsCount').textContent = `${totalRows} resultado${totalRows !== 1 ? 's' : ''}`;
  }

  function init() {
    document.getElementById('btnSearch').addEventListener('click', search);
    document.getElementById('searchProduct').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') search();
    });
  }

  return { init };
})();

// ══════════════════════════════════════════════════════════════
// Bootstrap
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  CategoriesModule.init();
  SuppliersModule.init();
  SearchModule.init();

  // Refrescar dropdowns al cambiar de pestaña
  document.getElementById('tab-proveedores').addEventListener('shown.bs.tab', () => {
    CategoriesModule.refreshDropdowns();
  });
  document.getElementById('tab-principal').addEventListener('shown.bs.tab', () => {
    CategoriesModule.refreshDropdowns();
  });
});
