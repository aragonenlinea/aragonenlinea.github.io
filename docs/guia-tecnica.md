# Guía técnica

Para quien continúe el desarrollo. El manual para publicar contenido está en `docs/manual-administracion.md`; las reglas del proyecto, en `CLAUDE.md`.

## Estado actual

- **Fase 1 (sitio público):** publicada en https://aragonenlinea.github.io. Sin inicio de sesión ni base de datos.
- **Fases 2 a 4:** pendientes (ver `CLAUDE.md`). El conjunto tiene **40 casas** (Casa 1 a 40), no torres ni apartamentos como muestra el prototipo; la tabla de unidades debe reflejarlo.

## Estructura

```
.github/workflows/publicar.yml   Revisa los JSON y publica web/ en GitHub Pages
web/                              Lo único que se publica
  index.html, comunicados.html, documentos.html, zonas.html, visor.html, 404.html
  css/estilos.css                 Todos los estilos; colores en :root (claro y oscuro)
  js/tema.js                      Aplica el modo claro/oscuro antes de pintar (script clásico)
  js/comun.js                     Encabezado, pie, menú (MENU), lectura de datos, fechas, íconos
  js/inicio.js, comunicados.js, documentos.js, zonas.js, visor.js   Una por página
  datos/*.json                    Contenido editable por la administración
  documentos/                     PDF publicados (ya revisados por datos personales)
  img/                            Logo, fotos, ícono
herramientas/tapar_pdf.py         Tapa datos personales en PDF (PyMuPDF)
referencia/prototipo.html         Prototipo aprobado (datos de prueba)
docs/                             Manuales
supabase/, sync/, plantillas/     Vacías; se usan desde la Fase 2
```

## Cómo funciona

- HTML, CSS y JavaScript sin compilación (módulos ES). Cada página carga su módulo, que llama a `montarPagina()` de `comun.js` y luego lee sus JSON con `cargar()`.
- Todo texto que viene de un JSON pasa por `esc()` antes de insertarse, y los enlaces por `enlaceSeguro()` (solo rutas propias, https, tel y mailto).
- Si un JSON está mal escrito, solo esa sección muestra un aviso; el resto de la página funciona.
- Cada página tiene una política de seguridad de contenido (etiqueta `Content-Security-Policy`): solo permite scripts propios y la fuente Manrope de Google Fonts. En la Fase 2 habrá que agregar el dominio de Supabase en `connect-src` y el CDN del cliente en `script-src`. No use atributos `style="..."` dentro del HTML generado: la política los bloquea.
- **Visor de documentos:** `visor.html?doc=documentos/archivo.pdf` muestra el PDF dentro del sitio con PDF.js (versión fija en `js/visor.js`, cargada desde cdnjs), página por página a medida que se desplaza, con zoom y botón de descarga opcional. Solo acepta archivos de `documentos/`. Su política de seguridad es la única que permite cdnjs (`script-src`, `worker-src blob:` y `connect-src`). Si PDF.js no carga, ofrece abrir el PDF en el navegador o descargarlo.
- Fechas en formato `AAAA-MM-DD` en los JSON; se muestran con `toLocaleDateString("es-CO")`.

## Ver el sitio en el PC

Requiere Python (ya instalado en el PC del proyecto). Desde la carpeta del proyecto:

```
python -m http.server 8000 --bind 127.0.0.1 --directory web
```

y abrir http://127.0.0.1:8000. Abrir `index.html` con doble clic no funciona: el navegador bloquea la lectura de los JSON sin servidor.

## Publicación

Cada `push` a `main` ejecuta `publicar.yml`: valida todos los `web/datos/*.json` con `python3 -m json.tool`, revisa los PDF con `herramientas/revisar_pdfs.py` (metadatos, correos, celulares y cédulas no permitidos; lista blanca en `herramientas/datos_permitidos.json`) y, si todo pasa, sube `web/` a GitHub Pages (Settings → Pages → Source: GitHub Actions). El repositorio es público: **nunca** suba datos reales de personas, originales sin tapar ni archivos `.env`.

Git: autor configurado solo en este repositorio como "Conjunto Residencial Aragón" con el correo privado `noreply` de GitHub, para no exponer correos personales en el historial.

## Tapar datos en un PDF

```
python -m pip install --user pymupdf
python herramientas/tapar_pdf.py original.pdf web/documentos/salida.pdf --texto "Nombre Apellido" --texto "12.345.678"
```

Para firmas u otras áreas: `--recuadro página,x0,y0,x1,y1` (puntos; hoja carta 612 x 792). Para encontrar las coordenadas de una firma:

```
python -c "import pymupdf; d=pymupdf.open('original.pdf'); [print(i+1, x['bbox']) for i,p in enumerate(d) for x in p.get_image_info()]"
```

Si el recuadro de la firma pisa el nombre impreso debajo, reduzca `y1` hasta justo encima del nombre. Revise siempre el resultado abriéndolo y buscando el dato con Ctrl+F. Los originales se guardan fuera del repositorio (por ejemplo `C:\Proyectos\material-aragon`).

## Pendientes conocidos

- El teléfono de portería publicado es temporal (celular de un miembro del consejo); reemplazar por el real.
- Confirmar con la administración qué horarios y valores rigen (manual 2021 vs. reglamento 2008) para piscina, BBQ y salón social. El sitio usa el manual.
- Definir el correo institucional definitivo: existe `conjuntoaragon2020@gmail.com` (citado en circulares) y el del proyecto `aragonenlinea.neiva@gmail.com`.
