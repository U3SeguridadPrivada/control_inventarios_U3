# Versión móvil y PWA

Guía de lo que se agregó para que Suite U3 se instale y se use como app en
teléfono.

## Cómo instalarla

- **Android / Chrome / Edge**: al entrar aparece abajo el banner "Instalar
  Suite U3". También sirve el menú del navegador → *Instalar app*.
- **iPhone / iPad (Safari)**: no existe instalación automática. El banner muestra
  las instrucciones: **Compartir** → **Agregar a pantalla de inicio**.
- Si se descarta el banner, no se vuelve a ofrecer durante 14 días
  (`localStorage: u3_pwa_install_dismissed`).

Requisito: el sitio debe servirse por **HTTPS** (o `localhost`). Sin HTTPS el
navegador no registra el service worker y no habrá instalación ni modo offline.

## Piezas nuevas

| Archivo | Para qué sirve |
| --- | --- |
| `public/manifest.webmanifest` | Nombre, colores, iconos y accesos directos de la app instalada. |
| `public/sw.js` | Service worker: caché de estáticos, respaldo offline, aviso de versión nueva. |
| `public/offline.html` | Pantalla que se muestra al navegar sin conexión. |
| `public/icons/*` | Iconos generados (192–512, maskable, apple-touch, favicons). |
| `scripts/generate-pwa-icons.mjs` | Regenera todos los iconos desde `public/logo_b.png`. |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | Registra el SW y avisa cuándo actualizar. |
| `src/components/pwa/InstallPrompt.tsx` | Banner de instalación (Android + guía iOS). |
| `src/components/pwa/NetworkStatus.tsx` | Barra amarilla "Sin conexión" y refresco al volver la red. |
| `src/components/MobileNav.tsx` | Barra de pestañas inferior con hoja "Más". |

### Regenerar los iconos

Si cambia el logo:

```bash
npm run pwa-icons
```

Lee `public/logo_b.png`, recorta el sobrante transparente y escribe todo
`public/icons/`. Requiere `sharp` (ya está en `devDependencies`).

## Estrategias de caché del service worker

| Recurso | Estrategia |
| --- | --- |
| `/api/*`, `/uploads/*` | **Nunca se interceptan.** Datos sensibles y token en cabecera. |
| `/_next/static/*`, iconos, fuentes | Cache-first (los nombres llevan hash, son inmutables). |
| Navegaciones (páginas) | Network-first con 6 s de espera → copia en caché → `/offline.html`. |
| Resto de GET del mismo origen | Stale-while-revalidate. |

Al publicar cambios de estrategia —o al editar cualquier archivo de la lista
`PRECACHE`, como `offline.html`— hay que **subir `VERSION` en `public/sw.js`**;
eso borra las cachés viejas al activarse. Va en `u3-v2`.

El service worker **solo se registra en producción**. En `npm run dev` se da de
baja cualquier registro previo para que no sirva bundles viejos.

### Cuando el usuario tiene una versión vieja

Al detectar un SW nuevo en espera aparece un aviso permanente con el botón
**Actualizar**, que le manda `SKIP_WAITING` y recarga la página.

## Navegación en móvil

En pantallas `< 768px` la barra lateral se reemplaza por una barra de pestañas
inferior con **Inicio · Almacén · Guardias · Agenda · Más**. Los cuatro primeros
se configuran en `NAV_MOBILE_PRIMARY_IDS` (`src/config/nav.ts`); todo lo demás
—incluido *Cerrar sesión*— vive en la hoja "Más".

## Utilidades de CSS disponibles

Definidas en `app/globals.css`:

- `--safe-top` / `--safe-bottom` / `--safe-left` / `--safe-right`: muescas y
  barras del sistema (`env(safe-area-inset-*)`).
- `--mobile-nav-height`: `4rem` en móvil, `0px` desde `768px`.
- `.pb-mobile-nav`: deja libre la barra inferior + zona segura.
- `.scroll-touch`: desbordes horizontales con inercia y sin arrastrar la página.
- `.no-scrollbar`, `.snap-row`, `.bleed-mobile`, `.pt-safe`, `.pb-safe`.
- `.touch-target`: altura mínima de 40 px solo en pantallas táctiles.

Al hacer pantallas nuevas: las alturas van en `svh` (no `vh`, que en móvil deja
contenido bajo la barra del navegador), y cualquier contenedor a sangre usa
`-m-4 sm:-m-6 lg:-m-8` para cuadrar con el padding del layout.

## Detalles de comportamiento

- Los `<input>`, `<select>` y `<textarea>` usan mínimo 16 px en móvil: por debajo
  de eso iOS hace zoom al enfocarlos.
- Los diálogos se abren como hoja anclada abajo en móvil y como modal centrado
  desde `640px`; bloquean el scroll de fondo y cierran con `Esc`.
- Las tablas no se comprimen: se desplazan en horizontal.
- React Query usa `networkMode: 'offlineFirst'` para no reintentar sin red, y
  refresca todo al recuperar la conexión.
