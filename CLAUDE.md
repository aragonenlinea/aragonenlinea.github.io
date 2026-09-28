# Plataforma Aragón en línea

Plataforma web propia de gestión del Conjunto Residencial Aragón (Neiva, Huila, Colombia), desarrollada por un miembro del consejo de administración con ayuda de Claude Code. El conjunto no pagará a un proveedor: la plataforma debe ser de bajo costo, fácil de mantener por personas que no son programadores y quedar documentada para que otros la puedan continuar.

## Cómo trabajar conmigo

- Respóndeme siempre en español colombiano, directo y sin introducciones de cortesía.
- No soy programador: explica cada paso en lenguaje simple y dime exactamente qué debo hacer yo (crear cuentas, copiar claves, instalar algo).
- Antes de escribir código en una fase nueva, presenta un plan corto y espera mi aprobación.
- Trabaja por fases. No avances a la siguiente fase sin que la anterior esté probada y yo la apruebe.
- Si no tienes certeza de un dato (límites de un servicio, una norma, un precio), dilo y búscalo; no lo inventes.
- Toda la interfaz en español, formato de fechas y moneda de Colombia (es-CO, pesos sin decimales).

## Reglas que no se negocian

1. **Pagos:** la plataforma no procesa pagos ni guarda datos bancarios. El botón "Pagar" solo enlaza al botón de recaudo o PSE del banco del conjunto.
2. **Datos personales (Ley 1581 de 2012):** autorización registrada (fecha, hora, versión de la política) antes de guardar datos de un residente; cada residente solo ve los datos de su unidad; minimizar datos. De menores de edad solo nombre y parentesco. Nunca pedir copias de cédula, datos de salud, religión ni ingresos.
3. **Seguridad:** Row Level Security activado en todas las tablas. La clave `service_role` de Supabase nunca va en el frontend ni en el repositorio; solo en el script del PC de la administración, en un archivo `.env` excluido de git. Nunca subir datos reales al repositorio: solo datos de prueba.
4. **Continuidad:** todas las cuentas (GitHub, Supabase, dominio) se crean con el correo institucional del conjunto, no con cuentas personales. Mantener la carpeta `docs/` actualizada.
5. **Asambleas:** las votaciones de la plataforma son consultas y encuestas, no decisiones de asamblea con validez legal (Ley 675 de 2001).
6. **Portería:** solo ve lo necesario (placa → unidad, código de visitante → nombre y unidad). No ve teléfonos, correos ni habitantes.

## Arquitectura

- **Frontend:** HTML, CSS y JavaScript sin paso de compilación (módulos ES), para que cualquiera pueda editarlo. Cliente de Supabase cargado desde CDN. Publicado en GitHub Pages.
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Row Level Security). Plan gratuito al inicio; verificar límites vigentes antes de lanzar.
- **Alimentación desde la administración:** el PC de la administración no es servidor. Alimenta la información por tres vías:
  1. Panel web de administración (formularios).
  2. Importación de Excel/CSV desde el panel.
  3. Script en Python (`sync/`) que vigila una carpeta del PC y sube archivos nuevos (cartera, actas, estados financieros), programado con el Programador de tareas de Windows.
- **Referencia visual y funcional:** `referencia/prototipo.html` (prototipo aprobado con datos de prueba). Conservar su identidad visual: verde #0F4C45, amarillo #E8B931, tipografía Manrope, modo claro y oscuro.

## Roles

- `residente`: propietario, arrendatario o residente autorizado de una unidad.
- `administracion`: administrador y auxiliares.
- `consejo`: lectura de indicadores e informes, sin datos personales detallados. Excepción (decidida el 2026-09-28): en la pestaña del Consejo ve los datos personales que el RPH le exige revisar para cumplir sus funciones (relación de pagos con nombre del acreedor, hojas de vida para autorizar personal, cartera para decidir cobros), y nada más. Entran principales y suplentes.
- `porteria`: validación de visitantes y consulta de placas.

## Modelo de datos (propuesta inicial, ajustar en la fase correspondiente)

unidades, perfiles (usuario ↔ unidad ↔ rol), autorizaciones_datos, contactos_unidad, habitantes, mascotas, vehiculos, cambios_pendientes (validación de la administración), comunicados, documentos, zonas_comunes, reservas, pqrs, pqrs_respuestas, visitantes, cartera_importaciones, cartera_unidad, encuestas, encuesta_opciones, votos (uno por unidad), auditoria.

## Plantilla de importación de cartera

Una fila por unidad. Columnas: unidad, fecha_corte, periodo, saldo_anterior, cuota_administracion, cuota_extraordinaria, parqueadero, multas, intereses_mora, pagos_periodo, saldo_total. Sin nombres de personas.

Al importar: vista previa; validar que todas las unidades existan, que no haya repetidas, que saldo_total cuadre con la suma de sus componentes y que el total general coincida con el informe contable. Si algo falla, no publicar. Guardar historial de cada importación. El programa contable de la administración aún no se conoce; la plantilla debe servir con cualquiera que exporte a Excel.

## Fases

1. **Sitio público:** portada, comunicados, documentos, zonas comunes, directorio. Sin inicio de sesión ni datos personales. Publicado en GitHub Pages. **Aprobada el 2026-09-27.**
2. **Acceso de residentes:** registro con autorización de datos, Mi hogar (contacto, habitantes, mascotas, vehículos con validación), PQRS, reservas. Panel de administración y censo. Entregas: 2a (Supabase, ingreso, autorización, Mi hogar, censo), 2b (PQRS y reservas).
3. **Estado de cuenta y gestión:** 3a cartera, estado de cuenta, pago, informes financieros y tableros (**aprobada el 2026-09-27**); 3b script de sincronización del PC y documentos privados de copropietarios; 3c proveedores, contratos y pólizas (RPH arts. 34, 60.13, 63); 3d pestaña del Consejo (RPH arts. 57-58, 60, 63, 71-74: reuniones, informe mensual del administrador, solicitudes de autorización, compromisos y calendario de obligaciones).
4. **Portería, visitantes y consultas:** autorización de visitantes por los residentes y su validación en portería, consulta de placas, encuestas a la comunidad. (Visitantes se movió de la Fase 2 a la 4 el 2026-09-27.)

## Decisiones tomadas

- **Unidades:** el conjunto son 40 casas (Casa 1 a 40), no torres ni apartamentos.
- **Ingreso (actualizado el 2026-09-28):** registro con código de invitación por casa, aprobado por la administración; la primera vez se entra con código al correo y, ya aprobado, el residente crea su contraseña (correo + contraseña; recuperación por correo). Las cuentas de **administración y consejo son institucionales**: aparte de la cuenta de la casa (la base de datos no permite mezclarlas) y entran **solo con código al correo**: una sesión abierta con contraseña no tiene permisos de administración ni de consejo (se verifica con el dato `amr` del token; ojo: Supabase pone una contraseña aleatoria a toda cuenta creada con código, así que no sirve mirar si la cuenta "tiene contraseña"). La administración puede **suspender** (con motivo, reversible) o **retirar** (definitivo) una cuenta.
- **Cuentas por casa:** una principal del propietario y una del arrendatario, esta última autorizada por el propietario (o por la administración con autorización escrita del propietario), con fecha de vencimiento opcional y revocable. El arrendatario no toma decisiones que corresponden al propietario: no autoriza ni retira accesos, no vota en encuestas, no ve el estado de cuenta salvo que el propietario lo habilite, no accede a documentos privados de copropietarios ni solicita obras de reforma; su trasteo requiere permiso del propietario.
- **Política de tratamiento de datos:** el conjunto no tenía. Borrador en `docs/politica-tratamiento-datos.md`, pendiente de revisión y aprobación; sin ella no se abre el registro a residentes reales.
- **Supabase:** región Estados Unidos (país con nivel adecuado de protección según la SIC; Brasil no está en esa lista). Plan gratuito: los proyectos inactivos una semana se pausan; se necesita una tarea programada que lo mantenga activo. El correo integrado de Supabase solo envía 2 correos por hora y solo a miembros del equipo: para residentes reales se requiere SMTP propio.
- **Revisor fiscal:** el conjunto no tiene (2026-09-28). No se crea ese rol.
- **Documentos publicados:** se revisan y tapan con `herramientas/tapar_pdf.py`; `herramientas/revisar_pdfs.py` frena la publicación si detecta datos personales.

## Estructura de carpetas

```
C:\Proyectos\plataforma_aragon\   (repositorio público aragonenlinea/aragonenlinea.github.io)
├── CLAUDE.md
├── referencia/prototipo.html
├── web/            # frontend publicado
├── supabase/       # esquema SQL, políticas RLS, datos de prueba
├── sync/           # script Python del PC de la administración
├── plantillas/     # plantilla de cartera y otras
├── herramientas/   # tapar y revisar datos personales en PDF
└── docs/           # manual de administración, manual de residentes, guía técnica
```

Los documentos originales del conjunto se reciben en `C:\Proyectos\material-aragon` (fuera del repositorio) y nunca se suben sin revisar.
