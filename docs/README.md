# Ventana de correo (logo + footer) — versión portable

Extracción de la ventana de redacción de `app/correo/page.tsx` del CRM
Bionordi, generalizada para usarse en **otro proyecto**. Se le quitó todo lo
específico de este CRM: el sistema de plantillas precargadas (`TPLS`),
las variables `{{nombre_doctor}}` etc., el autocompletado de leads, la
bandeja de entrada IMAP y el historial de envíos. Lo que queda es solo la
ventana en sí: header con logo, cuerpo editable (WYSIWYG), footer de marca,
barra de herramientas y envío.

## Archivos

- `buildEmailHtml.ts` — genera el HTML final "email-safe" (tablas, sin
  flexbox/grid) que se manda al destinatario: barra de acento + logo +
  cuerpo + footer + barra de acento. Equivalente a la función `chrome()`
  del original, pero con logo/colores/textos parametrizados.
- `EmailComposeWindow.tsx` — el componente React de la ventana flotante
  (minimizar/maximizar/cerrar), campos Para/Cc/Cco/Asunto, toolbar de
  formato, área `contentEditable`, preview con logo+footer, adjuntos y botón
  de enviar.

## Dependencias

- React 18+
- `lucide-react` (iconos)
- Tailwind CSS (todas las clases del componente son utilitarias de Tailwind).
  Si el proyecto destino no usa Tailwind, hay que traducir las clases a CSS
  propio — la estructura del componente no cambia.
- Next.js no es requisito; el componente solo usa hooks de React y APIs del
  navegador (`document.execCommand`, `FileReader`).

## Cómo integrarlo

```tsx
import { useState } from "react";
import { EmailComposeWindow } from "./EmailComposeWindow";

export function ComposeButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Redactar correo</button>

      <EmailComposeWindow
        open={open}
        onClose={() => setOpen(false)}
        senderName="Ana Torres"
        brand={{
          logoUrl: "https://tudominio.com/logo.png",
          logoAlt: "Nombre de tu empresa",
          companyName: "Tu Empresa S.A. de C.V.",
          footerTagline: "Descripción corta de lo que hace la empresa.",
          unsubscribeNote: "Si no desea recibir estos correos, por favor ignore este mensaje.",
          accentFrom: "#4E60A9",
          accentTo: "#38AD64",
        }}
        defaultSubject="Contacto"
        onSend={async (payload) => {
          const res = await fetch("/api/tu-endpoint-de-envio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          return { success: res.ok && data.success, error: data.error };
        }}
      />
    </>
  );
}
```

El componente **no manda correos por sí mismo** — solo arma `{ to, cc, bcc,
subject, html, text, attachments }` y llama a tu `onSend`. Ahí conectas tu
propio backend (Resend, SMTP, SendGrid, lo que uses).

## Notas importantes al portar

1. **Logo con URL pública y absoluta.** Los clientes de correo (Gmail,
   Outlook, Apple Mail) cargan la imagen del `<img>` desde sus propios
   servidores, no desde el navegador de quien lo redacta ni desde rutas
   relativas de tu app. Usa una URL `https://` fija (CDN, bucket público,
   GitHub raw, etc.), nunca `/logo.png` relativo.
2. **HTML basado en tablas.** `buildEmailHtml.ts` usa `<table>` a propósito:
   Outlook de escritorio (motor Word) no soporta flexbox/grid ni bien CSS
   moderno. No lo cambies a `<div>` con flexbox aunque se vea "anticuado" en
   el código.
3. **`document.execCommand` está deprecado** pero sigue funcionando en todos
   los navegadores mayores (es lo que usa Gmail, Outlook Web, etc. para sus
   propios editores). Si el proyecto destino requiere evitarlo, la
   alternativa es un editor rico completo (TipTap, Lexical, Slate) — implica
   reescribir la barra de herramientas.
4. **Adjuntos sin comprimir.** Este componente lee archivos a base64 tal
   cual. Si vas a permitir fotos de cámara (3–12MB), comprímelas antes de
   convertirlas (p. ej. `browser-image-compression` o un resize por canvas)
   — si no, el payload JSON puede superar límites de tu API/servidor.
5. **Pegar como texto plano.** `handlePaste` fuerza texto plano al pegar
   (`e.preventDefault()` + `insertText`) porque el HTML que arrastra Word u
   otro correo trae estilos que rompen el layout del template. Es
   intencional, no un bug.
6. El **preview en pantalla** (dentro de `EmailComposeWindow`) y el
   **HTML real enviado** (`buildEmailHtml`) están definidos por separado,
   igual que en el original — si cambias el footer o el logo, edítalos en
   los dos lugares para que no se desincronicen.
