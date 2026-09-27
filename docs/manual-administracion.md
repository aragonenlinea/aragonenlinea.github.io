# Manual de administración del sitio público

**Sitio:** https://aragonenlinea.github.io
**Dónde se edita:** https://github.com/aragonenlinea/aragonenlinea.github.io
**Cuenta:** `aragonenlinea` en GitHub (correo del proyecto). Las contraseñas y los códigos de recuperación **no** se escriben en este manual; se guardan donde el consejo lo haya definido.

Este manual es para la administración y el consejo. No hay que saber programar: todo se hace desde el navegador.

---

## 1. Cómo funciona, en una frase

El contenido del sitio (comunicados, eventos, documentos, zonas, contactos) está guardado en archivos de texto dentro de la carpeta `web/datos/` de GitHub. Cuando usted cambia uno de esos archivos y lo guarda, GitHub revisa que esté bien escrito y **publica el sitio solo, en 1 o 2 minutos**.

| Quiero cambiar... | Archivo |
|---|---|
| Comunicados | `web/datos/comunicados.json` |
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

1. Entre a https://github.com/aragonenlinea/aragonenlinea.github.io e inicie sesión.
2. Abra la carpeta `web`, luego `datos` y dé clic en `comunicados.json`.
3. Dé clic en el ícono del **lápiz** (arriba a la derecha, "Edit this file").
4. Justo después del primer corchete `[`, pegue este bloque y cambie los textos:

```json
  {
    "id": 5,
    "fecha": "2026-10-01",
    "categoria": "Mantenimiento",
    "titulo": "Título corto del comunicado",
    "texto": "Primer párrafo.\nSegundo párrafo.",
    "adjunto": ""
  },
```

   - **id:** un número que no se repita. Use el número más alto que ya exista, más uno.
   - **categoria:** por ejemplo Mantenimiento, Asamblea, Convivencia, Seguridad, Financiero, Administrativo.
   - **adjunto:** si el comunicado tiene un PDF, escriba su ruta, por ejemplo `"documentos/circular-05-2026.pdf"` (primero súbalo, vea la sección 4). Si no tiene, deje `""`.
   - Fíjese en la **coma al final** del bloque: separa este comunicado del siguiente.
5. Dé clic en el botón verde **Commit changes...** y luego otra vez en **Commit changes**.
6. Espere 1 o 2 minutos y recargue el sitio.

El orden en el sitio es por fecha: el más reciente aparece primero.

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

## 10. Cuentas y continuidad

- El sitio y el repositorio pertenecen a la cuenta `aragonenlinea`, creada con el correo del proyecto, no con cuentas personales.
- Al cambiar de administración o de consejo, se entregan el correo, la contraseña de GitHub, la app de verificación en dos pasos y los códigos de recuperación.
- Para cambios de diseño o de funcionamiento (no de contenido), consulte `docs/guia-tecnica.md`.
