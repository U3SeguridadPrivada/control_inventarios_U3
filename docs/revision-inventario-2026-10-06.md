**Revisión del flujo de inventario — 6 de octubre de 2026**

El flujo principal existe y varios movimientos conservan correctamente las cantidades, pero todavía hay caminos que duplican existencias, permiten saldos negativos o muestran información distinta entre almacén, equipo en campo y expedientes. No conviene dar por conciliado el inventario hasta resolver estos puntos y revisar los registros anteriores.

Se revisó el código actual del directorio de trabajo, incluidos los cambios locales que ya existían. No se modificó la lógica de la aplicación ni la base de datos. Se añadieron este informe, el script de auditoría y sus resultados.

**Evidencia y alcance**

- Se ejecutaron 20 escenarios con los handlers y cálculos reales, SQLite en memoria e identidad de prueba. Trece escenarios reprodujeron comportamientos incorrectos; varios corresponden al mismo problema de tallas. Siete escenarios de control terminaron correctamente.
- Se ejecutó un handler real del formulario de salidas, extraído del componente, para comprobar el tratamiento de cantidades decimales.
- Se consultó `db/app.db` con `readonly: true` y `fileMustExist: true`. Es la base local de esta copia, no una verificación de producción.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` terminó sin errores.
- No se automatizó el navegador, no se verificaron sesiones JWT reales, concurrencia entre procesos ni el aspecto visual del PDF generado. La revisión de reportes cubre sus datos, fórmulas, filtros y plantillas.

Archivos reproducibles: [script de auditoría](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/scripts/auditar-inventario.cjs>) y [resultados de los escenarios](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/docs/revision-inventario-2026-10-06-resultados.json>). Para repetir la auditoría desde la raíz: `node scripts/auditar-inventario.cjs`. El script no inicia el servidor ni ejecuta el inicializador de la base real; tampoco corrige los defectos detectados.

**Cómo funciona actualmente**

| Operación | Información capturada | Efecto en el sistema |
| --- | --- | --- |
| Catálogo | Nombre, categoría, uso de talla, tallas, mínimo y costo estimado | Define opciones de formularios y alertas. El nombre enlaza los movimientos; no se utiliza un identificador de artículo en entradas y salidas. |
| Compra / existencia inicial | Fecha, artículo, talla, cantidad, estado físico y motivo | Inserta una entrada que incrementa almacén. |
| Carga inicial de almacén | Fecha y cantidades nuevas, usadas e inutilizables por artículo/talla | Inserta múltiples entradas en una transacción. Las cantidades se suman a las existentes; no reemplazan el saldo con el conteo capturado. |
| Devolución de Equipo, formulario de entradas | Datos de entrada y nombre libre de quien entrega | Incrementa almacén sin resolver ninguna asignación. Esta diferencia causa el hallazgo 1. |
| Recuperado | Datos de entrada y guardia | Mueve piezas de campo o extraviadas a Devuelto y crea la entrada correspondiente. No acepta guardias con Baja Pendiente. |
| Asignación en campo | Guardia activo, fecha, artículos, tallas, estado Nuevo/Usado y cantidades | Comprueba disponibilidad e inserta salidas en estado Uniforme en Campo. El formulario genera una fila por pieza. |
| Equipo que ya traen | Guardia, fecha y renglones de equipo previo | Crea entrada y salida juntas; conserva almacén y aumenta equipo en campo. |
| Reposición | Guardia/artículo/talla ya asignados, fecha, cantidad, estado devuelto y entregado | Marca la asignación anterior como Devuelto, ingresa el equipo recibido y asigna el reemplazo. Se procesa en una transacción. |
| Extravío, ruta especializada | Guardia, artículo/talla asignados, cantidad y fecha | Cambia el estado de la asignación original a Extraviado. No vuelve a descontar una segunda pieza de almacén. |
| Baja por daño | Artículo, talla, cantidad, estado físico y observaciones | Descuenta existencias del estado indicado y las cuenta en Pérdidas/Bajas. Puede retirar piezas ya inutilizables. |
| Baja de guardia | Guardia y fecha | Cambia su equipo en campo a Uniforme en Bajas y crea checklist. Sin equipo, la nueva baja se completa inmediatamente. |
| Procesamiento de baja | Devolución o extravío y estado de devolución | Resuelve las piezas, crea entradas cuando vuelven y termina la baja al resolver el checklist. |
| Reportes | Datos agregados actuales | CSV general, PDF e impresión de inventario; CSV de entradas y salidas; impresión de checklist y del expediente de equipo del guardia. |

El cálculo central trabaja por **artículo + talla + estado físico**. Del total de entradas resta las salidas clasificadas como campo, bajas, entregas definitivas, devueltas, extraviadas y bajas por daño. Que una salida Devuelta siga restando es correcto en este modelo: la nueva entrada registra el regreso, posiblemente con otro estado físico. Dejar de restar la salida original duplicaría el saldo.

El almacén útil es Nuevo + Usado. El resumen de almacén total también incluye Inutilizable. Total Existente suma almacén total + campo + equipo pendiente en bajas. El mínimo se compara con el almacén útil de todo el artículo, sin mínimo por talla.

Pantalla y PDF general comparten los cálculos de [inventario](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/inventario.ts:44>) y la impresión comparte la [plantilla del reporte](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/inventarioTemplate.ts:42>). Esta centralización ayuda a evitar fórmulas diferentes, aunque también propaga los defectos del cálculo a todas las salidas.

**Estado encontrado en la base local**

| Dato | Resultado |
| --- | --- |
| Catálogo | 11 prendas |
| Entradas | 1 registro: 3 camisolas nuevas, talla 28 |
| Salidas | 2 registros: 1 camisola nueva, talla 28, cada uno |
| Saldo calculado | 1 pieza en almacén y 2 en campo |
| Asignaciones sin dueño | Salidas 1 y 2 tienen `guardia_id = null`; tampoco coincide su nombre almacenado con un guardia actual |
| Bajas abiertas | Procesos 2 y 3 están Pendientes, tienen checklist vacío y sus guardias están en Baja Pendiente |

Las dos piezas sin vínculo sí cuentan en el resumen de inventario, pero [Uniformes en Campo las omite](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/uniformes-campo/route.ts:22>). No se puede deducir su dueño de la base consultada. Hay que conciliarlas con la entrega física o el registro original antes de vincularlas; crear una asignación nueva descontaría almacén otra vez.

Los dos checklists vacíos son datos anteriores todavía abiertos. El código actual ya ofrece Finalizar baja para este caso y completa automáticamente las nuevas bajas sin equipo. No se cerraron durante esta revisión.

**Hallazgos prioritarios**

1. **P1 — La devolución libre puede duplicar una pieza que sigue asignada.** En Entradas se puede elegir Devolución de Equipo y escribir el nombre del guardia. Solo Recuperado ejecuta `moverAsignacion`; la devolución libre simplemente inserta una entrada. Reproducción: comprar 1, asignar 1 y devolverla desde ese formulario deja 1 en almacén + 1 en campo = 2 existentes. Es alcanzable con los formularios actuales. Debe vincularse la devolución a la asignación pendiente y resolverse en la misma transacción. Si se necesita recibir equipo externo sin asignación, debe ser una operación distinguible. Fuentes: [formulario](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/components/apps/EntradasApp.tsx:100>) y [registro de entrada](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/entradas/route.ts:49>).

2. **P1 — La talla es opcional en rutas que descuentan existencias y eso permite entregar el mismo stock dos veces.** Cuando no llega talla, `calcularStockDisponible` suma todas las tallas; la salida se guarda con talla nula. Después una solicitud de la talla concreta vuelve a encontrar disponible la entrada original. Con una sola camisola M se aceptaron dos asignaciones y el almacén terminó en −1. `bulk`, salida simple y reposición no aplican la normalización del catálogo que sí usan las entradas. Fuente: [filtro de stock](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/stock.ts:49>) y [alta del lote](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/salidas/bulk/route.ts:25>).

   El mismo defecto aparece desde operaciones normales del catálogo: desactivar “requiere talla” con existencias conserva entradas M pero crea salidas sin talla; archivar una prenda personalizada con tallas elimina su metadato del catálogo activo que consulta Salidas, y el respaldo fijo la considera sin talla. El resumen puede mostrar 0 mientras el detalle aún ofrece 1. Debe conservarse el metadato de prendas archivadas con existencias, validar las tallas en el servidor y controlar cualquier reclasificación de tallas con movimientos previos. Fuentes: [edición del catálogo](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/prendas/[id]/route.ts:29>) y [regla de talla en Salidas](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/components/apps/SalidasApp.tsx:62>).

3. **P1 — El servidor permite asignaciones sin guardia y ya hay datos así.** La ruta genérica solo comprueba el estado del guardia cuando recibe un ID, y no rechaza explícitamente un ID inexistente. Una asignación sin ID se guarda como Uniforme en Campo, descuenta almacén y queda fuera del listado que permite gestionar el equipo. Reproducción aislada: respuesta 201, campo = 1 y listado de campo vacío. El formulario de asignación actual usa `bulk` y sí exige guardia; la ruta genérica sigue expuesta y la base local contiene dos registros sin vínculo, aunque esta revisión no determina su origen. Exigir guardia existente y activo para conceptos de asignación; permitir referencias opcionales únicamente donde corresponda. Fuente: [salida genérica](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/salidas/route.ts:30>).

4. **P2 — El formulario de bajas no permite devolver una parte de un renglón.** Los botones envían siempre `cantidad_adeudada`. El registro de equipo previo sí puede producir renglones de varias piezas: si un guardia debe 3 y entrega 1, la pantalla solo permite declarar las 3 devueltas o las 3 extraviadas. El servidor admite cantidad parcial, pero declara extraviado todo el resto inmediatamente; no admite dejarlo pendiente para una segunda entrega. Añadir cantidades de devolución, extravío y pendiente según la regla operativa acordada. Fuente: [botones del checklist](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/components/apps/BajasApp.tsx:148>).

5. **P2 — La reposición acepta estados físicos que el inventario no admite.** Se confirmó que la API permite entregar Inutilizable y aceptar `ROTO` como estado de devolución. En el segundo caso, el registro existe pero no entra en ninguno de los tres grupos del cálculo: de 2 piezas físicas se pasó a mostrar 1. Los selectores actuales de la interfaz limitan las opciones; falta la validación equivalente en el servidor. Validar Nuevo/Usado para lo entregado y Nuevo/Usado/Inutilizable para lo recibido antes de modificar asignaciones. Fuente: [estados de reposición](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/salidas/reposicion/route.ts:32>).

6. **P2 — La ruta genérica acepta Extravío pero el cálculo ignora el registro.** El concepto se guarda con estado N/A, mientras la fórmula solo descuenta N/A cuando el concepto es Inutilizable. Una petición válida recibió 201 y dejó tanto stock como pérdidas sin cambio. La interfaz actual usa la ruta especializada, que sí funcionó en las pruebas. Debe retirarse este concepto de la ruta genérica o delegar su procesamiento al flujo de asignaciones. Fuentes: [salida genérica](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/salidas/route.ts:44>) y [categorías descontadas](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/stock.ts:18>).

7. **P2 — Archivar una prenda modifica los totales históricos del reporte general.** Una prenda archivada se elimina del resumen cuando almacén/campo/bajas son cero, aunque tenga entradas, pérdidas o entregas definitivas. Se reprodujo una pérdida que pasó de 1 a 0 en el reporte por archivar la prenda, sin ningún movimiento nuevo. Afecta pantalla, CSV y PDF. Los totales históricos deben calcularse con todos los movimientos, independientemente de si la prenda sigue disponible en los selectores de captura. Fuente: [filtro de prendas archivadas](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/inventario.ts:130>).

8. **P2 — Los saldos negativos se ocultan en el detalle y parcialmente en los reportes.** El detalle devuelve únicamente renglones con almacén útil positivo o inutilizable positivo. Un renglón negativo puede desaparecer; las columnas por estado de la tabla y del PDF muestran un guion cuando el saldo no es positivo. Esto dificulta conciliar una diferencia que sí afecta el total general. Reproducción: almacén −1 y detalle vacío. Mostrar el saldo negativo y una señal de inconsistencia; distinguir el listado para diagnóstico del selector de stock entregable. Fuentes: [detalle](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/inventario.ts:175>) y [celdas del resumen](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/components/apps/InventarioApp.tsx:559>).

9. **P2 — El expediente mezcla movimientos de guardias con el mismo nombre.** La consulta usa ID del guardia O nombre coincidente, incluso si la salida tiene el ID de otra persona. Con dos guardias homónimos, el segundo recibió en su expediente la salida del primero. Esto altera saldos y reportes individuales aunque la suma global siga igual. Resolver por ID; cualquier conciliación histórica por nombre debe limitarse a registros sin ID y requerir una correspondencia inequívoca. Fuente: [consulta de expediente](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/guardias/[id]/expediente/route.ts:16>).

10. **P2 — Capturar 1.5 piezas en asignación registra 2.** El selector conserva el decimal y `handleSubmitMulti` expande una fila por cada iteración `i < cantidad`. Con 1.5, el handler envió dos filas de una pieza y el servidor las aceptó. El botón ejecuta un handler fuera de un envío de formulario con validación nativa. Validar un entero positivo antes de expandir o enviar un renglón con su cantidad para que el servidor la valide directamente. Fuente: [expansión de cantidades](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/components/apps/SalidasApp.tsx:111>).

11. **P2 — La gráfica de movimientos pierde el año.** Agrupa por `fecha.substring(5)`, mezclando, por ejemplo, 6 de octubre de 2025 con 6 de octubre de 2026. La prueba mostró un punto 10-06 con 5 entradas en vez de dos fechas con 2 y 3. Además, ordenar MM-DD altera la cronología al cruzar de diciembre a enero. Agrupar y ordenar con YYYY-MM-DD y aplicar formato solo a la etiqueta. Fuente: [gráfica del dashboard](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/dashboard/metrics/route.ts:21>).

12. **P2 — Las entradas no validan completamente artículo/fecha y permiten sustituir el autor.** Se aceptó un artículo inexistente, `fecha-invalida` y `registrado_por: 'Otro usuario'`. `normalizarTalla` valida presencia de talla según el catálogo, pero no pertenencia a las tallas configuradas ni existencia del artículo. Los formularios restringen algunas opciones, pero el servidor debe sostener estas reglas. Guardar siempre el usuario autenticado como autor y, si hace falta capturar un responsable distinto, usar otro campo. Fuentes: [entrada](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/entradas/route.ts:23>) y [normalización](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/src/lib/asignaciones.ts:66>).

**Otras limitaciones observadas en los formularios y reportes**

Estas observaciones provienen del código; no se presentan como pruebas de navegador completadas.

| Área | Observación | Consecuencia / ajuste sugerido |
| --- | --- | --- |
| Fechas | Varios formularios y el procesamiento de bajas usan `toISOString().split('T')[0]`. | Es fecha UTC: durante la tarde/noche de Ciudad de México puede capturarse el día siguiente. Usar la fecha operativa de México. |
| Reposición | Se repone el mismo artículo y talla que tenía el guardia. | No existe selección independiente de talla devuelta y talla nueva; un cambio de talla requiere otro flujo. |
| Recuperación | Se elige artículo del catálogo activo, talla y guardia; no la asignación concreta. Se consumen primero piezas en campo y luego extraviadas. | No se distingue si lo recuperado era una pérdida anterior cuando ese guardia también tiene equipo activo de la misma prenda. Las prendas archivadas no aparecen para recuperar sin reactivarlas. |
| Carga inicial / equipo previo | Son movimientos aditivos, sin una clave que reconozca reenvíos. | Una captura repetida se suma de nuevo. La carga inicial sí avisa que no se repitan cantidades; equipo previo no muestra un saldo previo por renglón. |
| Corrección de capturas | No hay rutas de modificación/anulación de entradas o salidas ordinarias ni un movimiento explícito de ajuste físico. | Un error de captura queda sin un proceso visible para revertirlo conservando una razón y un autor. |
| Consulta de existencias | El detalle por talla se obtiene, pero la tabla principal solo muestra el agregado por artículo. | El usuario puede tener que abrir el reporte o un formulario de salida para consultar tallas. Conviene mostrar un desglose accesible desde la tabla. |
| Filtros | Filtrar inventario cambia las filas, pero TOTALES usa el inventario completo. CSV/PDF también exportan todo; los CSV de entradas y salidas ignoran la búsqueda. | Rotular claramente el total general y permitir exportar el resultado filtrado o el total completo. |
| Botón Excel | Descarga CSV, no un libro XLSX. | CSV sirve para abrir datos en Excel, pero no incluye hojas, formato ni fórmulas y el inventario exportado no incluye detalle por talla. |
| Corte histórico | El PDF presenta la fecha actual y agrega todos los movimientos; no recibe fecha de corte ni rango. | No existe reporte de existencias a una fecha pasada. El estado actual de las asignaciones sobrescribe el anterior. |
| Historial de estados | Existe fecha de última actualización, pero no una bitácora de todas las transiciones y sus autores. | Recuperar una pieza extraviada elimina su estado de pérdida del saldo actual y dificulta reconstruir el evento anterior. Los CSV de salidas tampoco exportan esa fecha de actualización. |
| Movimientos recientes | El dashboard usa fecha y concepto originales, no el evento de cambio de estado. | Un extravío de una entrega antigua no aparece como un movimiento nuevo fechado cuando se reportó. |
| Reporte individual | Reposiciones y devoluciones se emparejan por artículo y fecha; no por ID de movimiento ni talla. | Dos reposiciones de la misma prenda en un día pueden mostrar el estado recibido de otro renglón. |
| Pérdidas del guardia | El expediente incluye las bajas por daño con referencia al guardia como pérdidas suyas. | La pantalla de baja por daño permite guardia “solo de referencia”, pero el reporte puede interpretarlo como responsabilidad del guardia. |
| Catálogo y bajas | Renombrar actualiza entradas y salidas, pero no el nombre de artículo dentro del JSON de un checklist existente. | La operación resuelve por salida_id, pero el checklist y su impresión pueden conservar otra descripción. |
| Caché | Reposición invalida existencias/salidas, pero no la consulta `entradas`; algunas transiciones tampoco invalidan `expediente`. | Las vistas previamente cargadas pueden quedar desactualizadas hasta su siguiente recarga automática. |
| Fallos de consulta | Inventario devuelve una pantalla de carga si faltan datos; otras pantallas usan listas vacías por defecto sin mostrar el error. | Un error de API puede parecer carga indefinida o ausencia de movimientos. |
| Permisos | Estas rutas distinguen sesión y rol global viewer/editor/admin; no consultan permisos personalizados de crear/editar/eliminar por inventario. | Verificar que esa política corresponda a la operación. Los controles de prueba comprobaron 401/403 con identidad simulada, no la autenticación real. |

También existe una dependencia externa al módulo: [DELETE de chats de WhatsApp](<D:/Control de inventario/CONTROL_DE_INVENTARIOS_U3 - copia/app/api/whatsapp/chats/route.ts:79>) incluye borrar entradas, salidas y bajas. Está protegido por rol admin y confirmación `BORRAR TODO`, pero ejecuta los borrados sin una transacción global. Se revisó el código; no se ejecutó esta operación. Conviene separar el restablecimiento general de la operación de chats y hacerlo atómico.

**Controles que sí funcionaron en las pruebas**

- Compra → asignación → recuperación: conservó el número de piezas y reclasificó correctamente de Nuevo a Usado.
- Reposición normal → extravío → recuperación: conservó existencias y evitó duplicar la pérdida.
- Baja con devolución parcial en API: separó la parte devuelta y la extraviada; un reintento de la acción fue rechazado sin duplicar entradas.
- Nueva baja sin equipo: se completó automáticamente.
- Carga inicial con un renglón inválido: rechazó todo el lote. Equipo previo: aumentó campo sin descontar el saldo físico del almacén.
- Baja por daño de piezas inutilizables: descontó el grupo correcto y aumentó Pérdidas/Bajas.
- Identidad viewer y ausencia de sesión simuladas: se rechazaron las operaciones correspondientes.

**Orden sugerido de corrección**

1. Unificar devolución y validación de artículo/talla/estado/guardia en el servidor. Evitar asignaciones sin responsable y atender los saldos por talla antes de ampliar funciones.
2. Conciliar las dos salidas históricas sin guardia con sus comprobantes; revisar y finalizar los dos procesos vacíos cuando corresponda. Mantener separados reparación de datos y cambios de código.
3. Permitir resolución parcial desde Bajas, validar cantidades enteras y distinguir las tallas de devolución/reposición.
4. Corregir reportes: conservar históricos de artículos archivados, mostrar inconsistencias, resolver expedientes por ID y conservar el año en las gráficas.
5. Incorporar anulación/ajuste con motivo y autor, trazabilidad de transiciones, fecha operativa local y comprobaciones de reenvío en capturas aditivas.

Esta revisión entrega diagnóstico y reproducciones. Los cambios funcionales y la conciliación de datos quedan pendientes.
