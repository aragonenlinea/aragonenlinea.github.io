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

Cada `push` a `main` ejecuta `publicar.yml`: valida todos los `web/datos/*.json` con `python3 -m json.tool`, revisa los PDF con `herramientas/revisar_pdfs.py` (metadatos, correos, celulares y cédulas no permitidos; lista blanca en `web/datos/datos_permitidos.json`) y, si todo pasa, sube `web/` a GitHub Pages (Settings → Pages → Source: GitHub Actions). El repositorio es público: **nunca** suba datos reales de personas, originales sin tapar ni archivos `.env`.

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

## Fase 2: zona de residentes (Supabase)

- **Proyecto:** `aragon-en-linea`, región East US. URL y clave *publishable* en `web/js/config.js` (son públicas; la seguridad la da RLS). La clave *secret* / *service_role* nunca va en el repositorio.
- **Librería:** `@supabase/supabase-js` con versión fija, desde jsdelivr (`SUPABASE_JS` en `config.js`). Flujo `implicit`: el enlace del correo funciona aunque se abra en otro navegador. También se acepta el código de 6 dígitos (`verifyOtp`).
- **Caché del navegador:** GitHub Pages permite guardar archivos 10 minutos (`max-age=600`). Al cambiar `admin.js`, `mi-hogar.js` o `ingresar.js`, suba el número de versión en su página (`js/admin.js?v=2` → `?v=3`) para que los navegadores carguen la nueva.
- **Páginas:** `ingresar.html`, `mi-hogar.html`, `admin.html` (con `noindex`). Ningún elemento generado por JavaScript puede usar `id="contenido"`: es el `<main>` de todas las páginas. Solo estas tres permiten conectarse a Supabase y a jsdelivr en su política de seguridad. El menú muestra "Mi cuenta" cuando `acceso_residentes` es `true` en `web/datos/sitio.json`.
- **Base de datos:** archivos numerados en `supabase/`, que se pegan en orden en el SQL Editor:
  1. `001_esquema.sql`: tablas, RLS en todas, funciones y disparadores.
  2. `002_datos_iniciales.sql`: 40 casas y versión de la política.
  3. `003_pruebas_seguridad.sql`: 54 pruebas que simulan cada rol; se deshacen solas y muestran el resultado como un mensaje en rojo.
  4. `004_primer_administrador.sql`: da el rol de administración (o consejo) a una cuenta que ya ingresó.
  5. `005_mejoras_retiro.sql`: aviso de acceso retirado, limpieza de pendientes y conteos solo de cuentas vigentes.
  6. `006_limpiar_datos_prueba.sql`: borra las cuentas `aragonenlinea.neiva+…` y su rastro. Solo antes del lanzamiento.
  7. `007_pqrs_reservas_comunicados.sql`: PQRS con radicado y conversación, zonas reservables y reservas (un turno no se reserva dos veces; la disponibilidad no revela quién reservó), y comunicados.
  8. `008_pruebas_pqrs_reservas.sql`: 41 pruebas de la entrega 2b (mismo formato que 003; requiere 009).
  9. `009_zonas_editables.sql`: la administración edita `zonas_reservables` (validaciones de turnos y rangos); el público lee las zonas activas.
  10. `010_cartera.sql`: `cartera_importaciones` (historial; publicada/anulada), `cartera_unidad` (una fila por casa y corte, con chequeo de cuadre), `configuracion_pagos` y `importar_cartera` (valida todo en el servidor y guarda todo o nada; la acepta la administración o la clave de servicio del script). Propietario ve su casa; arrendatario solo con `puede_ver_cuenta`; consejo solo `resumen_cartera`.
  11. `011_pruebas_cartera.sql`: 29 pruebas de validación y acceso de la cartera (requiere 012).
  12. `012_cartera_edades_y_pagos.sql`: segundo botón de pago (`url_banco`, `texto_boton_banco`, solo https) y totales por antigüedad (`edades`) en `resumen_cartera`.
  13. `013_finanzas.sql`: `presupuestos` y `presupuesto_rubros` (uno vigente por año), `informes_mensuales`, `ejecucion_mensual` y `pagos_mes`; funciones `importar_presupuesto`, `importar_informe_mes` (rubros deben existir en el presupuesto, pesos enteros, sumas iguales a los totales del informe, beneficiario solo empresas o entidades según `privado.beneficiario_es_entidad`) y `admin_anular_financiero`. Ven los informes las cuentas activas, el consejo y la administración (`privado.puede_ver_finanzas`).
  14. `014_pruebas_finanzas.sql`: 19 pruebas del módulo financiero (usa el año 2099).
  15. `015_tablero_cartera.sql`: `historial_cartera()`, totales de los últimos 24 cortes publicados (sin casas) para el tablero; la ven las cuentas activas, el consejo y la administración.
  16. `016_pruebas_tablero.sql`: 9 pruebas del tablero de cartera.
  17. `017_limpiar_cartera_finanzas_prueba.sql`: borra toda la cartera, presupuestos e informes del ejercicio. Solo una vez, antes de cargar la información real (ver `docs/instructivo-cargue-informacion.md`).
  21. `021_estado_suspendido.sql`: agrega el estado `suspendido` a `estado_perfil`. Se corre **solo**, antes de 022 (PostgreSQL no deja usar un valor nuevo de un tipo enum en la misma transacción en que se crea).
  22. `022_cuentas_institucionales.sql`: cuentas de administración y consejo separadas de las de casa (disparador `privado.separar_cuentas`; retira casas registradas en cuentas institucionales), `privado.es_admin()` y `privado.es_consejo()` exigen además `privado.sin_contrasena()` (la cuenta no tiene `auth.users.encrypted_password`), `admin_suspender_perfil`, `admin_reactivar_perfil`, `admin_retirar_perfil` (también suspendidas) y `mi_estado` con `tiene_contrasena`, `institucional` y perfiles suspendidos. Al final muestra las cuentas institucionales y si tienen contraseña.
  23. `023_pruebas_cuentas.sql`: 17 pruebas (requiere 024): permisos según cómo se entró, separación de cuentas, constancia de contraseña, suspender, reactivar, retirar.
  24. `024_correccion_ingreso_institucional.sql`: corrige 022 (ver "Ingreso institucional solo con código").
  18. `018_documentos_privados.sql`: espacio privado `privados` en Supabase Storage (solo PDF, 50 MB), tabla `documentos_privados` (audiencia `copropietarios` o `consejo`, nombre de archivo aleatorio `docs/AAAA/uuid.pdf`, confirmación de revisión obligatoria, hallazgos revisados), reglas sobre `storage.objects` (leer solo si el documento está registrado, publicado y le corresponde; subir y borrar solo la administración), `registrar_documento` y `retirar_documento`. El arrendatario no ve estos documentos (`privado.es_copropietario`).
  19. `019_pruebas_documentos.sql`: 23 pruebas de acceso a la lista y a los archivos.
  20. `020_correccion_mensajes.sql`: corrige `importar_cartera`, `importar_presupuesto` e `importar_informe_mes`, que ante un dato inválido mostraban un error técnico ("malformed array literal") en vez del mensaje explicativo. En PL/pgSQL, `lista_texto || 'literal'` se interpreta como unión de listas: se escribe `'literal'::text`.
  Los cambios futuros van en archivos nuevos (`005_...`), nunca editando los ya aplicados.
- **Modelo:** `perfiles` une usuario, casa y rol (`propietario`, `arrendatario`, `administracion`, `consejo`). Una cuenta de propietario y una de arrendatario por casa (índices únicos). Los registros de Mi hogar pertenecen al perfil que los creó; un disparador los devuelve a *pendiente* ante cualquier cambio que no haga la administración. Las funciones `privado.*` alimentan las reglas RLS; las `public.*` son la API que llama el sitio y responden `{ok, mensaje}`.
- **Códigos de invitación:** 8 caracteres sin letras ambiguas; solo se guarda su huella SHA-256; 10 intentos fallidos por hora como máximo.
- **Política de datos:** tabla `politicas` con una sola versión activa. Al aprobar una nueva: `insert` de la versión (con `activa = false`), luego `update politicas set activa = false;` y después `update politicas set activa = true where version = 'X';` (en dos pasos, por el índice que permite una sola activa). La plataforma vuelve a pedir la autorización.
- **Fechas:** `privado.hoy()` da la fecha de Colombia (UTC-5 fijo, sin horario de verano). Los días hábiles cuentan lunes a viernes sin festivos (`privado.dias_habiles_entre`).
- **Comunicados:** tabla `comunicados` en Supabase. El sitio público los lee con una consulta REST directa (`cargarComunicados` en `comun.js`), sin cargar la librería; por eso `index.html` y `comunicados.html` permiten conectarse a Supabase. El visitante anónimo tiene una regla RLS propia: no puede evaluar funciones del esquema `privado`.
- **Zonas reservables:** tabla `zonas_reservables` (turnos en JSON, anticipación en días hábiles, capacidad, reglas), editable desde el panel (pestaña Zonas). La página pública de zonas combina `web/datos/zonas.json` (descripción) con esa tabla para las entradas que tienen `zona_reservable` (`cargarZonas` en `comun.js`); si Supabase no responde, usa el texto del JSON.
- **Cartera en el panel:** `js/cartera-admin.js` lee Excel/CSV en el navegador con SheetJS (versión fija desde `cdn.sheetjs.com`, permitido solo en `admin.html`), acepta nombres de columna alternativos, montos con formato colombiano y negativos entre paréntesis, y muestra la vista previa con los mismos chequeos que `importar_cartera`. Plantilla y ejemplo de prueba en `plantillas/`.
- **Informes financieros:** `finanzas.html` + `js/finanzas.js` (tabla rubro × mes, gráfico de barras por grupo en HTML/CSS con la marca de lo esperado, pagos del mes). Los anchos de las barras se asignan por JavaScript porque la política de seguridad (CSP) de la página bloquea los estilos en línea. La importación está en `js/finanzas-admin.js` (pestaña Finanzas del panel), que reutiliza `leerMonto` y `leerFecha` de `cartera-admin.js` y repite en el navegador el filtro de nombres de personas del servidor. Plantillas en `plantillas/plantilla_presupuesto.xlsx` y `plantillas/plantilla_informe_mensual.xlsx` (rubros del presupuesto 2026, valores en cero).
- **Documentos privados:** `documentos-conjunto.html` + `js/documentos-conjunto.js` (lista con filtros), `visor.html?privado=ID` (el visor consulta el registro con la sesión y pide a Storage un enlace firmado de 10 minutos) y `js/documentos-admin.js` (pestaña Documentos del panel). `js/revisar-pdf.js` limpia los metadatos con pdf-lib 1.17.1 (jsdelivr, `+esm`) y lee el texto con PDF.js para buscar correos, celulares y cédulas con contexto; la lista blanca institucional está en `web/datos/datos_permitidos.json` (la usa también `herramientas/revisar_pdfs.py`). Pruebas locales: `supabase/pruebas/simulacion_storage.sql` imita `storage.buckets` y `storage.objects`.
- **Ingreso y contraseñas:** `ingresar.js` entra con `signInWithPassword` (residentes), `signInWithOtp` + `verifyOtp` (primera vez e institucionales) y `resetPasswordForEmail` con destino `contrasena.html`. `contrasena.js` usa `updateUser({ password })`; no deja crear contraseña a cuentas institucionales. `cuenta.js` (`esInstitucional`, `soloResidentes`) filtra el menú y saca a las cuentas institucionales de Mi hogar, Estado de cuenta, PQRS y Reservas.
- **Ingreso institucional solo con código (024):** los permisos de administración y consejo se evalúan según cómo se abrió la sesión: el token de Supabase trae el dato `amr` con el método de ingreso (`password`, `otp`, `magiclink`…) y lo conserva al renovar la sesión. Si la sesión se abrió con contraseña, `privado.sin_contrasena()` es falso y no hay permisos. **No** sirve mirar `auth.users.encrypted_password`: Supabase le pone una contraseña aleatoria a toda cuenta creada con código (ese fue el error de 022, corregido en 024). `mi_estado` devuelve `sesion_con_contrasena`; `tiene_contrasena` sale de la tabla `contrasenas_creadas`, que llena `registrar_contrasena()` desde la página Mi contraseña.
- **Configuración de Supabase para contraseñas:** Authentication → proveedor Email habilitado; longitud mínima 8 y requisito de letras y números; plantilla *Reset Password* en español (`docs/plantillas-correo.md`); `https://aragonenlinea.github.io/contrasena.html` dentro de las Redirect URLs permitidas. La protección contra contraseñas filtradas solo existe en el plan Pro.
- **Tableros:** `js/graficos.js` dibuja columnas, columnas apiladas y líneas en SVG sin librerías (`lugar()` deja el espacio en el HTML y `dibujar()` lo dibuja al ancho real de la caja, y otra vez al cambiar el tamaño de la ventana); `activarRecuadros()` muestra los valores al pasar el mouse, tocar o enfocar. Los colores salen de clases CSS (`--c1`, `--c2`, rampa `--r1`…`--r5` para la antigüedad), validados para daltonismo en modo claro y oscuro. `js/tablero-cartera.js` arma el tablero de cartera; con el detalle por casa (solo administración) agrega el mapa de las 40 casas.
- **Mantener activo:** `.github/workflows/mantener-activo.yml` consulta Supabase a diario (el plan gratuito pausa tras una semana sin uso).
- **Correos:** SMTP de Gmail con contraseña de aplicación y plantillas en español: ver `docs/plantillas-correo.md`.

### Probar la base de datos en el PC (sin tocar Supabase)

Se usó un PostgreSQL 16 portátil (binarios del paquete `pgserver` de PyPI, descomprimidos en una carpeta temporal) y `supabase/pruebas/simulacion_supabase.sql`, que imita roles, `auth.users`, `auth.uid()` y `auth.jwt()`. Orden: simulación → 001 → 002 → 003. Para comprobar que las pruebas detectan fallas, se introdujeron fallas a propósito (una regla que deja ver todo, un arrendatario tratado como propietario, un residente que se autovalida) y las pruebas las reportaron.

## Pendientes conocidos

- El teléfono de portería publicado es temporal (celular de un miembro del consejo); reemplazar por el real.
- Confirmar con la administración qué horarios y valores rigen (manual 2021 vs. reglamento 2008) para piscina, BBQ y salón social. El sitio usa el manual.
- Definir el correo institucional definitivo: existe `conjuntoaragon2020@gmail.com` (citado en circulares) y el del proyecto `aragonenlinea.neiva@gmail.com`.
