# Webscraper de Proveedores

Herramienta para automatizar el proceso de compra de insumos en instituciones y dependencias de gobierno. Realiza web scraping en páginas de proveedores para comparar precios y garantizar la adquisición al mejor costo.

Soporta categorías como Papelería, Equipo de cómputo, Electricidad, Equipo de Oficina, entre otras.

## Requisitos previos

- [Node.js](https://nodejs.org/) v18 o superior
- [Google Chrome](https://www.google.com/chrome/) instalado en `/usr/bin/google-chrome` (requerido por Puppeteer para scraping de sitios con JavaScript)

Verificar instalaciones:

```bash
node --version
google-chrome --version
```

## Instalación

```bash
# Clonar o descargar el proyecto, luego instalar dependencias
npm install
```

## Ejecución

```bash
# Modo producción
npm start

# Modo desarrollo (reinicia automáticamente al guardar cambios)
npm run dev
```

El servidor inicia en `http://localhost:3000`. Abrir esa URL en el navegador.

## Uso

### 1. Registrar categorías

1. Ir a la pestaña **Categorías**
2. Agregar categorías como: `Papelería`, `Equipo de cómputo`, `Electricidad`, etc.

### 2. Registrar proveedores

1. Ir a la pestaña **Proveedores**
2. Para cada proveedor, ingresar:
   - **Nombre** y **categoría**
   - **URL de búsqueda**: la URL del sitio con `{q}` donde va el término buscado

   Ejemplo de URL para un proveedor genérico:

   ```text
   https://www.proveedor.com/buscar?q={q}
   ```

   Los siguientes proveedores tienen soporte integrado (basta con pegar su URL principal):
   - `https://www.cyberpuerta.mx/` — scraping con interacción de formulario
   - `https://www.digitalife.com.mx/` — scraping con interacción de formulario
   - `https://www.mercadolibre.com.mx/` — requiere búsqueda manual (bloqueado por bot-detection)

3. También puede usar el botón **Cargar proveedores con API libre** para agregar proveedores precargados a las categorías existentes.

### 3. Buscar precios

1. Ir a la pestaña **Principal**
2. Escribir el producto a cotizar (ej. `resma papel bond carta`)
3. Seleccionar una categoría (opcional) y hacer clic en el botón de búsqueda
4. La tabla de resultados muestra proveedor, producto encontrado y precio por cada fuente consultada

## Arquitectura

```text
server.js          → Servidor Express (puerto 3000) + API /api/scrape
index.html         → Interfaz SPA con Bootstrap 5
js/app.js          → Lógica del frontend (localStorage para categorías y proveedores)
css/styles.css     → Estilos adicionales
```

El endpoint `GET /api/scrape?url=URL_PROVEEDOR&q=PRODUCTO` recibe la URL del proveedor y el término de búsqueda, y devuelve una lista de productos con nombre, precio y enlace.

## Notas importantes

- Los datos de categorías y proveedores se almacenan en `localStorage` del navegador (no hay base de datos).
- Cyberpuerta y Digitalife requieren Google Chrome instalado; usan Puppeteer para navegar el sitio como un usuario real.
- MercadoLibre bloquea el acceso automatizado desde servidores. Se muestra un mensaje de error con instrucciones para búsqueda manual.
- El scraping respeta un filtro de relevancia por palabras clave para descartar resultados no relacionados.
