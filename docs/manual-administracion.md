# Manual de administración del sitio público

**Sitio:** https://aragonenlinea.github.io
**Dónde se edita:** https://github.com/aragonenlinea/aragonenlinea.github.io
**Cuenta:** `aragonenlinea` en GitHub (correo del proyecto). Las contraseñas y los códigos de recuperación **no** se escriben en este manual; se guardan donde el consejo lo haya definido.

Este manual es para la administración y el consejo. No hay que saber programar: todo se hace desde el navegador.

---

## 1. Cómo funciona, en una frase

Los **comunicados** se publican desde el **panel de administración** (sección 3). El resto del contenido (eventos, documentos, zonas, contactos) está guardado en archivos de texto dentro de la carpeta `web/datos/` de GitHub. Cuando usted cambia uno de esos archivos y lo guarda, GitHub revisa que esté bien escrito y **publica el sitio solo, en 1 o 2 minutos**.

| Quiero cambiar... | Archivo |
|---|---|
| Comunicados | Panel de administración → pestaña **Comunicados** |
| Próximos eventos | `web/datos/eventos.json` |
| Lista de documentos | `web/datos/documentos.json` (los PDF van en `web/documentos/`) |
| Zonas comunes | `web/datos/zonas.json` |
| Normas básicas de la portada | `web/datos/normas.json` |
| Fotos de la galería | `web/datos/fotos.json` (las fotos van en `web/img/`) |
| Teléfonos, correo, dirección, lema | `web/datos/sitio.json` |

---

## 2. Reglas para escribir en los archivos de datos

Los archivos `.json` son listas. Cada elemento va entre llaves `{ }` y los elementos se separan con una coma. Casi todos los errores vienen de una coma o unas comillas.

1. Los textos van **entre comillas dobles**: `"titulo": "Corte de agua"`.
2. Entre un elemento `{ ... }` y el siguiente va **una coma**. **Después del último elemento no va coma.**
3. Las fechas se escriben **año-mes-día**: `"2026-10-15"`.
4. Para hacer un salto de línea dentro de un texto escriba `\n`.
5. Si el texto necesita comillas, use comillas simples o angulares: `'así'` o `«así»`.
6. No borre los nombres de los campos (lo que está antes de los dos puntos).

**Si se equivoca, el sitio no se daña:** GitHub no publica el cambio con error y el sitio sigue mostrando la versión anterior. Solo hay que corregir el archivo (vea la sección 9).

---

## 3. Publicar un comunicado

1. Entre al sitio → **Mi cuenta** (con el correo de administración) → pestaña **Comunicados**.
2. Llene **fecha**, **categoría**, **título** y **texto**. Los párrafos se separan con Enter.
3. **Documento adjunto** (opcional): elija un PDF de la lista de documentos del sitio. Si el PDF es nuevo, primero súbalo (sección 4) y luego vuelva aquí.
4. Deje marcada la casilla **Publicado** para que se vea de inmediato; desmárquela para guardarlo como borrador.
5. **Publicar**. Aparece en el sitio al instante (no hay que esperar a GitHub).

Para corregir uno: **Editar**, cambie y **Guardar cambios**. **Eliminar** lo quita del sitio definitivamente.

El orden en el sitio es por fecha: el más reciente aparece primero. Aplique las mismas reglas de la sección 5: no escriba datos personales en los comunicados.

---

## 4. Subir un PDF (circular, acta, reglamento)

**Antes de subir cualquier PDF, lea la sección 5.**

1. Nombre del archivo: en minúsculas, sin espacios ni tildes, con guiones. Ejemplo: `circular-05-2026.pdf`.
2. En GitHub abra la carpeta `web/documentos`.
3. Botón **Add file** → **Upload files** → arrastre el PDF.
4. Abajo, dé clic en **Commit changes**.
5. Agregue el documento a la lista: abra `web/datos/documentos.json`, lápiz, y pegue después del `[`:

```json
  {
    "categoria": "Circulares",
    "titulo": "Circular 05-2026: Tema",
    "descripcion": "Una frase que explique de qué se trata.",
    "fecha": "2026-10-01",
    "archivo": "documentos/circular-05-2026.pdf"
  },
```

6. **Commit changes**.

En el sitio, cada documento tiene dos botones: **Ver**, que lo abre dentro del sitio (también en celular), y **Descargar**, que es opcional.

Para retirar un documento: borre su bloque en `documentos.json` y luego borre el PDF en `web/documentos` (abrir el archivo → menú de tres puntos → **Delete file**). Ojo: GitHub guarda el historial, así que un PDF que se subió por error **sigue existiendo en el historial**. Por eso la revisión de la sección 5 se hace **antes** de subir.

---

## 5. Datos personales: revisar ANTES de publicar

**El sitio es público:** cualquier persona en internet puede verlo y los buscadores pueden encontrarlo. Aplica la Ley 1581 de 2012.

### Nunca se publica

- Números de cédula, teléfonos o correos personales, direcciones de personas.
- Firmas escaneadas.
- Nombres de residentes, empleados o contratistas asociados a deudas, sanciones, quejas o conflictos.
- Cartera o deudas por casa, estados de cuenta, listados de morosos.
- Datos de menores de edad, de salud o de ingresos.
- Actas con asistentes, votaciones por casa o discusiones sobre personas.

### Sí se puede publicar

- Normas, reglamentos, manuales, circulares generales, horarios.
- El nombre y cargo del administrador cuando firma como representante legal (sin la firma).
- Datos del conjunto: NIT, dirección, correo y teléfonos institucionales.

### Cómo tapar datos correctamente

**No sirve dibujar un cuadro negro encima en un editor de PDF**: casi siempre el texto sigue debajo y se puede copiar.

- **Si tiene el documento en Word:** borre el dato (o reemplácelo por `[dato suprimido]`), quite la firma escaneada y vuelva a guardarlo como PDF.
- **Si solo tiene el PDF:** pídale a la persona encargada de la parte técnica que lo tape con la herramienta `herramientas/tapar_pdf.py` (explicada en la guía técnica), que borra el texto de verdad.
- Después de tapar, abra el PDF, busque el dato con Ctrl+F: si lo encuentra, **no está tapado**.

### Revisión automática

Antes de publicar, GitHub revisa todos los PDF y **no publica** si encuentra:
- autor, título o asunto en los datos ocultos del archivo (Word los guarda solos, con el nombre de quien lo escribió);
- correos o números de celular que no sean los institucionales del conjunto;
- números con formato de cédula (12.345.678).

**No detecta firmas escaneadas ni fotos de personas:** esas se revisan a mano.

Si la revisión frena la publicación (X roja en **Actions**, paso "Revisar datos personales en los PDF"), el mensaje dice qué archivo, qué página y qué dato. Entonces:
- si es un dato personal: tape el PDF (ver arriba) y súbalo de nuevo con el mismo nombre;
- si solo son datos ocultos: la herramienta `herramientas/tapar_pdf.py` los borra;
- si es un correo o teléfono **institucional** del conjunto: agréguelo en `herramientas/datos_permitidos.json`. Nunca agregue ahí datos de personas.

Mientras tanto el sitio sigue mostrando la versión anterior, sin el PDF nuevo.

---

## 6. Eventos, contactos, zonas y normas

**Evento** (`eventos.json`). Los eventos que ya pasaron se ocultan solos. Si la lista está vacía se ve `[]`; para agregar el primero, reemplace `[]` por:

```json
[
  { "fecha": "2026-10-20", "titulo": "Jornada de aseo", "detalle": "Punto de encuentro en la portería, 8:00 a. m." }
]
```

**Contactos** (`sitio.json`, parte `directorio`). Cada contacto tiene `nombre`, `detalle` (lo que se ve) y `enlace`:
- teléfono: `"enlace": "tel:+573001234567"` (con +57 y sin espacios)
- correo: `"enlace": "mailto:correo@ejemplo.com"`
- sin enlace: `"enlace": ""`

**Zonas comunes** (`zonas.json`) y **normas** (`normas.json`): cambie solo los textos entre comillas. Cada zona tiene `horario`, `costo`, `capacidad`, `reserva`, una lista de `reglas` y la `fuente` (artículo del manual o reglamento). Si cambia una norma, actualice también la fuente.

**Franja amarilla de "sitio en construcción"**: en `sitio.json`, `"modo_prueba": true` la muestra y `false` la oculta.

---

## 7. Fotos de la galería

1. Use fotos **sin personas (ni siquiera parcialmente, en los bordes), sin placas de vehículos y sin números de casa visibles**. Revise también los bordes: dedos, sombras o reflejos.
2. Reduzca el tamaño a menos de 500 KB (en Windows: abrir con Fotos → "…" → Cambiar tamaño → "M").
3. Nombre en minúsculas sin espacios, por ejemplo `salon-social.jpg`, y súbala a `web/img` (Add file → Upload files).
4. En `fotos.json` agregue: `{ "archivo": "img/salon-social.jpg", "descripcion": "Salón social" },`
5. Se muestran hasta 6 fotos; la primera de la lista sale grande.

---

## 8. Cómo saber si el cambio se publicó

En el repositorio, pestaña **Actions**:
- Círculo amarillo: publicando.
- Chulo verde: publicado. Recargue el sitio (si no ve el cambio, Ctrl+F5).
- X roja: **no se publicó**. Vea la sección 9.

---

## 9. Si aparece la X roja o el sitio muestra un aviso de error

1. En **Actions**, abra la ejecución con la X roja y luego el paso **Revisar los archivos de datos**. El mensaje dice qué archivo tiene el error.
2. Abra ese archivo en GitHub con el lápiz y revise:
   - ¿Falta una coma entre dos bloques `}` `{`?
   - ¿Sobra una coma después del último bloque, antes del `]`?
   - ¿Falta cerrar unas comillas?
3. Corrija y guarde (**Commit changes**). Si queda verde, listo.

Para ver qué cambió y cuándo: abra el archivo y dé clic en **History**. Ahí se ve cada versión anterior; puede copiar el texto de una versión que funcionaba y pegarlo de nuevo.

---

## 10. Panel de administración (residentes)

Entre al sitio → **Mi cuenta** con el correo que tiene el rol de administración; lo lleva directo al panel.

- **Pendientes:**
  - *Cuentas por aprobar:* antes de aprobar, verifique que la persona sea propietaria de la casa (registro de copropietarios o certificado de libertad y tradición). Si rechaza, escriba el motivo: la persona lo verá.
  - *Datos por validar:* habitantes, mascotas y vehículos nuevos o cambiados. Validar o rechazar con motivo.
- **PQRS:** bandeja de peticiones, quejas, reclamos y sugerencias. *Ver y responder* muestra la conversación; al enviar una respuesta queda **Respondida**. *Marcar en trámite* avisa que se está atendiendo. Si el residente escribe de nuevo, vuelve a **En trámite**. Se resaltan las abiertas con más de 15 días hábiles.
- **Reservas:** solicitudes de salón social y zona BBQ. Antes de aprobar, verifique que la casa esté a paz y salvo (el Manual no permite usar el salón ni la BBQ con más de dos meses de mora). El alquiler se cobra en la administración: la plataforma no recibe pagos. Una reserva aprobada se puede *Anular* con motivo.
- **Zonas:** turnos, horarios, tarifas, anticipación mínima (días hábiles), hasta cuántos días adelante se puede reservar, capacidad y reglas de cada zona que se reserva. Ajústelos según lo aprobado por la asamblea, el consejo o el manual de convivencia; los cambios se ven de inmediato en Reservas y en la página pública de Zonas comunes. *Agregar turno* / *Quitar* (no se puede quitar un turno con reservas vigentes). *Nueva zona* crea otra zona reservable (por ejemplo, el polideportivo para eventos). Desmarcar *Activa* deja de aceptar reservas nuevas sin borrar el historial. Las demás descripciones de la página de zonas (reglas detalladas, zonas que no se reservan) siguen en `web/datos/zonas.json`.
- **Comunicados:** ver la sección 3.
- **Cartera:** ver la sección 11.
- **Censo:** resumen de las 40 casas y de las PQRS, sin nombres ni teléfonos. Es lo único que ve el consejo.
- **Códigos de invitación:** marque las casas (el botón "Marcar casas sin propietario" ayuda), genere e **imprima de inmediato**; los códigos no se vuelven a mostrar. Generar uno nuevo anula el anterior sin usar. Entregue cada código en sobre cerrado al propietario.
- **Cuentas:** todas las cuentas activas. *Retirar* se usa, por ejemplo, cuando se vende una casa. También puede autorizar a un arrendatario **solo con autorización escrita del propietario**, que debe archivar.

Para dar acceso a una persona del consejo o de la administración, se usa el archivo `supabase/004_primer_administrador.sql` en Supabase (pida ayuda técnica).

## 11. Cartera y estado de cuenta

**Quién:** la contadora entrega el archivo de cartera; la **administración lo revisa y lo publica** (el administrador es quien cobra las cuotas y presenta los informes, según el Reglamento, art. 60; el consejo aprueba los balances mensuales, art. 58). El consejo ve los totales en su panel.

**Cada mes:**

1. Descargue la **plantilla** desde el panel (pestaña **Cartera** → *plantilla de cartera*) o use el archivo que le entregue la contadora con las mismas columnas. Una fila por casa, **sin nombres de personas**. Saldos a favor en negativo.
2. Panel → **Cartera** → *Archivo* → elija el Excel (o CSV).
3. Revise la **vista previa**: las filas con errores salen en rojo con la explicación. Si hay errores, corrija el archivo y cárguelo de nuevo.
4. Escriba el **total de la cartera según el informe contable**. Debe decir *Cuadra*.
5. **Publicar cartera**. Los residentes lo ven de inmediato en *Mi cuenta → Estado de cuenta*.

Si publicó un archivo equivocado: **Anular** en el historial (los residentes vuelven a ver el corte anterior) y publique el correcto. Nada se borra: queda el historial.

**Configuración del pago** (misma pestaña): enlace de PSE o botón de pago del banco, texto del botón, instrucciones (convenio Davivienda 01660018; referencia 1 = número de casa, que se escribe como `{casa}`) y aviso de pronto pago. **La plataforma no cobra ni guarda datos bancarios**: el botón solo abre la página del banco.

**Nunca publique** el anexo de cartera de los estados financieros tal como viene: trae nombres de deudores.

## 12. Cuentas y continuidad

- El sitio y el repositorio pertenecen a la cuenta `aragonenlinea`, creada con el correo del proyecto, no con cuentas personales.
- Al cambiar de administración o de consejo, se entregan el correo, la contraseña de GitHub, la app de verificación en dos pasos y los códigos de recuperación.
- Para cambios de diseño o de funcionamiento (no de contenido), consulte `docs/guia-tecnica.md`.
