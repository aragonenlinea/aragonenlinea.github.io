# Instructivo de cargue de información · Aragón en línea

Para el **administrador de la página** y la **administradora del conjunto**. Explica cómo pasar del ejercicio de prueba a la información real, y cómo hacer los cargues de cada mes sin inconvenientes.

> Hasta la aprobación del consejo, lo que hay en la plataforma (cartera, presupuesto, informes) es un **ejercicio para estructurar la página**. No es información oficial.

## Quién hace qué

| Persona | Qué hace |
|---|---|
| **Contadora** | Entrega cada mes el archivo de cartera y el informe del mes, en Excel. |
| **Administradora del conjunto** | Revisa los archivos y los publica desde el panel (cartera, informes, comunicados, reservas, PQRS). Es quien responde por la información (Reglamento, art. 60). |
| **Administrador de la página** | Tareas técnicas: dar accesos, correr los archivos SQL en Supabase, editar los datos del sitio en GitHub, apoyar a la administradora. |
| **Consejo** | Aprueba la puesta en marcha y revisa los informes (Reglamento, art. 58). |

## Parte 1 · Una sola vez: pasar de prueba a real

Hágalo **en este orden**, cuando el consejo apruebe la plataforma y la política de tratamiento de datos.

### 1.1 Antes de empezar (administrador de la página)

- [ ] Política de tratamiento de datos **aprobada** por el consejo (`docs/politica-tratamiento-datos.md`). Sin ella no se abre el registro de residentes.
- [ ] Correo institucional definido (hoy `aragonenlinea.neiva@gmail.com`; decidir si se usa `conjuntoaragon2020@gmail.com`).
- [ ] Teléfono **real** de portería (hoy aparece un celular personal, temporal).
- [ ] Enlace oficial de **PSE** entregado por el banco (el de Davivienda del convenio 01660018 también, si hay botón en línea).

### 1.2 Dar acceso a la administradora

1. La administradora entra al sitio → **Mi cuenta** → escribe su correo → abre el enlace o el código que le llega. Con eso su correo queda registrado.
2. El administrador de la página abre Supabase → **SQL Editor** → **New query** → pega `supabase/004_primer_administrador.sql`, **cambia el correo** por el de la administradora → **Run**. La verificación final debe mostrarla con rol `administracion` y estado `activo`.
3. Para los miembros del consejo se usa el mismo archivo, con las líneas del consejo (quitando los `--` del comienzo).

### 1.3 Borrar los datos de prueba (administrador de la página)

En Supabase → SQL Editor, **en este orden**:

1. `supabase/006_limpiar_datos_prueba.sql` → borra las cuentas de prueba (`aragonenlinea.neiva+…`) con sus casas, Mi hogar, PQRS y reservas.
2. `supabase/017_limpiar_cartera_finanzas_prueba.sql` → borra **toda** la cartera, presupuestos e informes del ejercicio. Al final debe mostrar **0** en todo.
3. En el panel → **Comunicados**: elimine los comunicados de prueba que no deban quedar.
4. En el panel → **Documentos**: **Retire** los documentos de prueba. Supabase no permite borrar archivos con SQL (por seguridad), así que el 017 no los toca: al retirarlos desde el panel se borra también el archivo.

> Estos dos archivos **no se pueden deshacer**. Úselos solo una vez, antes de cargar la información real.

### 1.4 Ajustar el sitio (administrador de la página, en GitHub)

En `web/datos/sitio.json` (ver *Manual de administración*, sección 2):

- Quitar la línea `"residentes_en_pruebas": true` (o cambiarla a `false`): así desaparece el aviso de "zona en pruebas".
- Cambiar el teléfono de portería y el correo de contacto por los reales.

Espere 1 o 2 minutos a que se publique y revise con **Ctrl + Shift + R**.

En Supabase → **Authentication → URL Configuration → Redirect URLs**, borre `http://127.0.0.1:8000/**` (solo servía para probar en el PC). Debe quedar únicamente `https://aragonenlinea.github.io/**`.

### 1.5 Primer cargue de información real (administradora, en el panel)

Siga este orden, porque cada paso depende del anterior:

1. **Configuración del pago** (Panel → *Cartera*): pegue el enlace de PSE y el del banco del convenio. **Ábralos antes** y confirme que llevan a la página del banco (candado y nombre del banco en la dirección).
2. **Presupuesto del año** (Panel → *Finanzas* → *1. Presupuesto del año*): el aprobado por la asamblea. Ver Parte 2.2.
3. **Informes de los meses ya cerrados del año**, de enero en adelante (Panel → *Finanzas* → *2. Informe de cada mes*). Ver Parte 2.3.
4. **Último corte de cartera** (Panel → *Cartera*). Ver Parte 2.1. Si la contadora tiene los cortes de meses anteriores, cárguelos **del más viejo al más nuevo**: así se ve la evolución.
5. Revise lo que ven los residentes: *Mi cuenta → Informes financieros* (tres pestañas) y *Estado de cuenta*.
6. **Códigos de invitación** (Panel → *Códigos de invitación*): genere, **imprima de inmediato** y entregue en sobre cerrado a cada propietario.
7. Publique un **comunicado de lanzamiento** invitando a registrarse (ver *Manual de residentes*).

## Parte 2 · Cada mes

Calendario sugerido (acuérdelo con la contadora):

| Cuándo | Qué | Dónde |
|---|---|---|
| Primeros 10 días del mes | La contadora entrega cartera e informe del mes anterior | Correo / USB |
| Apenas se reciban | Publicar la **cartera** con corte al último día del mes | Panel → Cartera |
| Apenas se reciban | Publicar el **informe del mes** | Panel → Finanzas |
| Después de publicar | Revisar tableros y avisar al consejo | Mi cuenta → Informes financieros |

### 2.1 Cartera

**Archivo:** la plantilla `plantillas/plantilla_cartera.xlsx` (se descarga desde el panel), o el Excel de la contadora con las mismas columnas. Una fila por casa:

`unidad, fecha_corte, periodo, saldo_anterior, cuota_administracion, cuota_extraordinaria, parqueadero, multas, intereses_mora, pagos_periodo, saldo_total`

Opcionales (columnas amarillas) para el cuadro de antigüedad: `mora_1_30, mora_31_90, mora_91_180, mora_181_360, mora_mas_360`. Si no se llenan, la deuda sale como *Sin clasificar*.

**Reglas del archivo:**
- **Sin nombres de personas.** Solo el número de casa.
- Pesos **sin decimales**. Saldos a favor en **negativo**.
- `saldo_total` = saldo anterior + cuotas + parqueadero + multas + intereses − pagos.
- Si llena la antigüedad, las cinco columnas deben sumar el saldo total de la casa.
- Una sola fecha de corte y un solo periodo en todo el archivo.

**Pasos:** Panel → **Cartera** → *Archivo* → elegir el Excel → revisar la vista previa (errores en rojo) → escribir el **total de cartera del informe contable** → debe decir *Cuadra* → **Publicar cartera**.

### 2.2 Presupuesto (una vez al año)

**Archivo:** `plantillas/plantilla_presupuesto.xlsx`. Una fila por rubro: `tipo` (ingreso o gasto), `grupo` (HONORARIOS, SERVICIOS…), `rubro`, `valor_anual`.

- Incluya **todos** los rubros que puedan tener movimiento en el año, **aunque sea con valor 0** (descuento pronto pago, multas, intereses de mora, diversos, abogado…).
- Use **exactamente los mismos nombres** de rubro que usa la contadora en el informe mensual.
- **No cambie los nombres de los rubros a mitad de año.** Si hay que corregir el presupuesto, publíquelo de nuevo con los mismos nombres: reemplaza al anterior.

**Pasos:** Panel → **Finanzas** → *1. Presupuesto del año* → archivo → revisar → año y fecha de la asamblea → **Publicar presupuesto**.

### 2.3 Informe del mes

**Archivo:** `plantillas/plantilla_informe_mensual.xlsx`, con dos hojas:

- **Ejecucion:** una fila por rubro con lo **causado en el mes** (lo que aparece en el estado de resultados de ese mes, no el acumulado). Descuentos en negativo.
- **Pagos** (opcional): lo pagado en el mes según el flujo de caja: `fecha, rubro, beneficiario, concepto, valor`.

**Datos personales en los pagos:** en *beneficiario* solo van **empresas o entidades** (SAS, LTDA, S.A., E.S.P., DIAN, bancos…). Los pagos a **personas** (administradora, contadora, abogado, todero) se identifican por el rubro, por ejemplo *Honorarios administrador*, y el beneficiario se deja **vacío**. Si se escribe un nombre, la plataforma no deja publicar.

**Pasos:** Panel → **Finanzas** → *2. Informe de cada mes* → archivo (si el nombre es tipo `informe_2026_08_agosto.xlsx`, el año y el mes se llenan solos) → escribir **total ingresos**, **total gastos** y, si el archivo trae hoja de pagos, **total pagos** del informe contable → todos deben decir *cuadra* → **Publicar informe**.

### 2.4 Documentos del conjunto (cuando haya actas, estados financieros o informes)

Panel → **Documentos** → elegir el PDF → revisar lo que la plataforma encuentre → título, categoría, fecha y quién lo ve (propietarios o **solo consejo**) → confirmar la revisión → **Publicar documento**. Los estados financieros se suben con el **anexo de cartera tapado** (sin nombres de deudores). Detalle en el *Manual de administración*, sección 13.

## Parte 3 · Si algo sale mal

### Me equivoqué y ya publiqué

Nada se borra: en el **historial** de la pestaña (Cartera o Finanzas) presione **Anular** en la carga equivocada y publique la correcta. Los residentes dejan de ver la anulada de inmediato. Publicar de nuevo el mismo mes o año también reemplaza al anterior.

### Mensajes de error frecuentes

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| *No cuadra: el archivo suma … y el informe dice …* | El total del Excel no es igual al del informe contable | Revisar con la contadora qué casa o rubro falta o sobra |
| *el saldo total … no cuadra con la suma de sus componentes* | En una casa, la suma de conceptos menos pagos no da el saldo | Corregir esa fila |
| *falta el saldo total (si usa fórmulas…)* | El Excel tiene fórmulas que no se han calculado | Abrir el archivo en Excel, **Guardar**, y volver a cargarlo |
| *la Casa N está repetida* | Dos filas para la misma casa | Dejar una sola |
| *casa "…" no válida (1 a 40)* | Número de casa mal escrito | Escribir solo el número, del 1 al 40 |
| *tiene decimales* | Hay centavos | Redondear a pesos |
| *Hay varias fechas de corte* | Filas con fechas distintas | Poner la misma fecha en todo el archivo |
| *la antigüedad de la deuda … no suma el saldo total* | Las columnas de mora no suman el saldo | Corregir o dejarlas vacías |
| *no está en el presupuesto 2026* | Un rubro del informe no existe en el presupuesto | Agregarlo al presupuesto (aunque sea con 0), publicarlo de nuevo y volver a cargar el informe |
| *No hay presupuesto publicado de …* | Falta el presupuesto de ese año | Publicar primero el presupuesto |
| *"…" parece el nombre de una persona* | Hay un nombre en *beneficiario* | Dejar el beneficiario vacío |
| *No vienen N casa(s)* | El archivo no trae todas las casas | Si esas casas están al día, marcar la confirmación; si no, completar el archivo |
| *No se pudo leer el archivo* | No es un Excel válido | Guardar como **Libro de Excel (.xlsx)** |

### El sitio no muestra lo nuevo

Presione **Ctrl + Shift + R** (en celular: cerrar y abrir el navegador). El sitio puede tardar hasta 10 minutos en actualizarse para todos.

## Parte 4 · Reglas que no se negocian

1. **Nunca** se publican nombres de deudores ni el anexo de cartera de los estados financieros tal como viene.
2. **Nunca** se escriben nombres de personas naturales en los pagos.
3. Los PDF (actas, circulares, estados financieros) se **revisan y tapan** antes de subirlos (*Manual de administración*, sección 5).
4. La plataforma **no cobra**: los botones de pago solo abren la página del banco.
5. Las cifras de la plataforma son **informativas**. Los estados financieros oficiales son los que firma la contadora y se presentan a la asamblea.
6. Las claves (correo, GitHub, Supabase) se guardan en un lugar seguro del conjunto y se entregan en cada cambio de administración.

## Lista de chequeo mensual (para imprimir)

- [ ] Recibí de la contadora: cartera del mes y estado de resultados (con flujo de caja).
- [ ] Revisé que el archivo de cartera **no tenga nombres**.
- [ ] Publiqué la cartera y dijo *Cuadra*.
- [ ] Publiqué el informe del mes: ingresos, gastos y pagos dijeron *cuadra*.
- [ ] Los pagos a personas quedaron **sin nombre**.
- [ ] Revisé *Informes financieros* (tablero, cartera y detalle) y *Estado de cuenta* de una casa.
- [ ] Avisé al consejo que el informe del mes está publicado.
