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
- `consejo`: lectura de indicadores e informes, sin datos personales detallados.
- `porteria`: validación de visitantes y consulta de placas.

## Modelo de datos (propuesta inicial, ajustar en la fase correspondiente)

unidades, perfiles (usuario ↔ unidad ↔ rol), autorizaciones_datos, contactos_unidad, habitantes, mascotas, vehiculos, cambios_pendientes (validación de la administración), comunicados, documentos, zonas_comunes, reservas, pqrs, pqrs_respuestas, visitantes, cartera_importaciones, cartera_unidad, encuestas, encuesta_opciones, votos (uno por unidad), auditoria.

## Plantilla de importación de cartera

Una fila por unidad. Columnas: unidad, fecha_corte, periodo, saldo_anterior, cuota_administracion, cuota_extraordinaria, parqueadero, multas, intereses_mora, pagos_periodo, saldo_total. Sin nombres de personas.

Al importar: vista previa; validar que todas las unidades existan, que no haya repetidas, que saldo_total cuadre con la suma de sus componentes y que el total general coincida con el informe contable. Si algo falla, no publicar. Guardar historial de cada importación. El programa contable de la administración aún no se conoce; la plantilla debe servir con cualquiera que exporte a Excel.

## Fases

1. **Sitio público:** portada, comunicados, documentos, zonas comunes, directorio. Sin inicio de sesión ni datos personales. Publicado en GitHub Pages.
2. **Acceso de residentes:** registro con autorización de datos, Mi hogar (contacto, habitantes, mascotas, vehículos con validación), PQRS, reservas, visitantes. Panel de administración y censo.
3. **Estado de cuenta:** plantilla de cartera, importación desde el panel, script de sincronización del PC, enlace al pago del banco.
4. **Portería y consultas:** validación de visitantes y placas, encuestas a la comunidad.

## Estructura de carpetas

```
plataforma-aragon/
├── CLAUDE.md
├── referencia/prototipo.html
├── web/            # frontend publicado
├── supabase/       # esquema SQL, políticas RLS, datos de prueba
├── sync/           # script Python del PC de la administración
├── plantillas/     # plantilla de cartera y otras
└── docs/           # manual de administración, manual de residentes, guía técnica
```
