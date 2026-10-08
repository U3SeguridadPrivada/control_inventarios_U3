# Sistema de diseño de Suite U3

Guía corta de cómo está armada la interfaz. Sirve para que cualquier pantalla nueva se vea igual que las demás sin volver a decidir colores, medidas ni estructura de formularios.

## Principios

- Sobrio y de oficina: fondo gris azulado, tarjetas blancas con borde fino, sombras bajas.
- Un solo color de acción, el azul del logotipo (`#1A4A91`). El naranja de acento queda reservado.
- Sin degradados, sin emojis como iconos, sin destellos, sin tarjetas de colores distintos por módulo.
- El color solo se usa cuando comunica estado: verde listo, ámbar pendiente, rojo error o pérdida.

## Tokens (`app/globals.css`)

- **Colores:** `primary`, `ink` (tinta oscura para pastillas), `canvas` (gris suave del perfil), `muted`, `border`, `input` (borde de campos, más firme que el de las tarjetas).
- **Radios:** `rounded-lg` 8 px para controles, `rounded-xl` 10 px para tarjetas, `rounded-2xl` 14 px para ventanas. El perfil del guardia usa radios amplios (`rounded-[24px]` y `rounded-[28px]`).
- **Sombras:** `shadow-xs` en reposo, `shadow-md` al pasar el cursor, `shadow-soft` solo en el perfil del guardia.
- **Tipografía:** Plus Jakarta Sans variable, autoalojada en `public/fonts/`. Las hojas imprimibles (protocolos, reglamentos, contratos) conservan la tipografía del sistema: hay una regla al final de `globals.css` que lo asegura.
- **Etiquetas de campo:** la clase `field-label` unifica tamaño y peso en todos los módulos.

## Componentes (`src/components/ui/`)

| Componente | Para qué |
| --- | --- |
| `Button` | Variantes `default`, `outline`, `ghost`, `destructive`, `secondary`, `soft` (marca suave) y `dark` (tinta oscura). El `gap` separa icono y texto. |
| `Input`, `Select`, `Textarea` | Campos con halo de marca al enfocar y `aria-invalid` para el estado de error. `Select` trae su propia flecha. |
| `Badge` | Etiquetas suaves: `success`, `warning`, `destructive`, `info`, `secondary`, `outline`. Con `dot` lleva un punto de color. |
| `Card`, `Table` | Contenedores y tablas con cabecera discreta. |
| `KpiCard` | Indicador con etiqueta, cifra y contexto. Todas comparten forma; el `tone` solo se usa si el dato lo pide. |
| `PageHeader` | Ruta opcional, título, descripción y acciones. Un solo patrón de encabezado. |
| `SegmentedTabs` | Pestañas en pastilla; sirven para secciones y para filtros con contador. |
| `Avatar`, `ProgressRing`, `InfoGrid` | Foto o monograma, anillo de avance y datos de solo lectura. |
| `Dialog` | Ventana base. `DialogHeader` y `DialogFooter` sangran hasta el borde del panel y agregan botón de cierre. |
| `FormDialog`, `ConfirmDialog` | Marco de formularios y de confirmaciones. Ver abajo. |
| `Field`, `FieldGrid`, `FormSection`, `InputGroup`, `Callout` | Piezas para armar formularios. Ver abajo. |

## Cómo armar un formulario

```tsx
<FormDialog
  open={abierto} onOpenChange={setAbierto}
  size="lg" icon={UserPlus}
  title="Nuevo cliente" description="Alta manual en el sistema comercial."
  submitLabel="Crear" submitting={guardando.isPending}
  footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
  onSubmit={() => guardar.mutate(form)}
>
  <FormSection title="Datos generales" icon={Building2}>
    <FieldGrid cols={2}>
      <Field label="Nombre" required span={2}><Input value={...} required /></Field>
      <Field label="Teléfono"><InputGroup icon={Phone}><Input type="tel" /></InputGroup></Field>
    </FieldGrid>
  </FormSection>
</FormDialog>
```

Reglas:

- La etiqueta va siempre arriba del campo. `Field` asocia etiqueta y control solo, siempre que el hijo sea un único elemento; con varios controles se usa `group`.
- Se marca con asterisco lo obligatorio. No se rotula cada campo opcional: genera ruido y desalinea etiquetas largas.
- Cada sección lleva título corto y, si ayuda, una línea de contexto.
- Con `aside` el formulario muestra un panel lateral en pantallas anchas (resumen vivo, avance, índice de secciones). En el teléfono se oculta y la ventana sube como hoja inferior.
- `FormDialog` entrega el evento ya cancelado a `onSubmit`, así que sirve también con manejadores que esperan un `FormEvent`.
- Para eliminar o dar de baja se usa `ConfirmDialog` o `FormDialog` con `tone="danger"` y un `Callout` que explique la consecuencia.
- Las ventanas antiguas hechas con `Dialog` heredan el marco, pero un `DialogContent` con `overflow-hidden` no recibe el sangrado ni el botón de cierre automático.

## Marco de la aplicación

- `Sidebar` expandido con etiquetas y grupos desplegables; se contrae a iconos con el botón del encabezado. El estado se recuerda en el navegador (`ShellContext`).
- `Header` con ruta (grupo y módulo), buscador de módulos (`Ctrl K`), fecha, correo y, en el teléfono, avatar.
- `MobileNav` queda como barra inferior; el módulo activo lleva una pastilla bajo el icono.
- Las etiquetas del menú viven en `src/config/nav.ts` (`navLabel`).

## Perfil del guardia

`GuardiaPerfil` y `guardia/PerfilWidgets.tsx` siguen el lenguaje del lienzo gris: tarjeta de identidad en azul de marca con anillo de expediente, filas de indicadores con pastillas oscuras, calendario de círculos con los días de movimiento, datos del elemento y una tarjeta con pestañas (expediente, uniformes y actividad). La lista lateral de personal solo se monta en pantallas de 1700 px o más.

## Probar sin tocar datos reales

Para ver los cambios en un segundo servidor sin afectar al que está en uso:

```powershell
$env:NEXT_DIST_DIR = '.temp/mi-prueba/next'
$env:SQLITE_DB_PATH = 'C:\ruta\a\una\copia\app.db'
npm run dev -- -p 3100
```

Next agrega por su cuenta el directorio de salida al `include` de `tsconfig.json`; conviene quitar esa línea al terminar.
