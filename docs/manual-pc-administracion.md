# Programa del PC de la administración · Aragón en línea

Un programa pequeño que publica en la plataforma lo que la administradora ponga en una carpeta del PC: cartera, informes del mes y documentos. Hace **las mismas validaciones del panel** (y las repite la base de datos): si algo no cuadra, no se publica nada y queda un aviso con lo que hay que corregir.

> El panel web sigue funcionando igual. El programa es una comodidad: sirve sobre todo para lo que llega cada mes de la contadora.

## Parte A · Instalación (la hace el administrador de la página, una sola vez)

**Necesita:** el PC de la administración (Windows 10 u 11) con internet, y acceso a Supabase con el correo institucional.

### A.1 Crear una clave secreta solo para este PC

1. Supabase → **Project Settings** → **API Keys** → sección **Secret keys** → **Add new secret key**.
2. Nombre: `pc_administracion`. Créela y **cópiela** (empieza por `sb_secret_`).
3. **No la pegue en ningún otro lugar** (ni correo, ni chat, ni documento). Solo en el instalador del paso A.2.

Una clave propia para el PC permite **revocarla** sin afectar nada más si el PC se daña, se pierde o se cambia de administración (Secret keys → los tres puntos → *Delete*), y crear otra.

### A.2 Instalar

1. En el PC de la administración, abra <https://github.com/aragonenlinea/aragonenlinea.github.io> → botón verde **Code** → **Download ZIP**. Descomprima el archivo (clic derecho → *Extraer todo*).
2. Entre a la carpeta `sync` y haga **doble clic en `INSTALAR.bat`**. Si Windows muestra "Windows protegió su PC": *Más información* → *Ejecutar de todas formas*.
3. El instalador:
   - instala Python si no está (con *winget*, puede tardar unos minutos) y las librerías;
   - copia el programa a `C:\Aragon en linea\programa`;
   - **le pide la clave secreta**: péguela (no se ve mientras la pega) y presione Enter. Queda en un archivo que solo puede leer el usuario de Windows de ese PC;
   - prueba la conexión: debe decir **"Conexión y clave correctas"**;
   - programa la tarea de Windows **"Aragon en linea - publicar"**: corre **al iniciar sesión y cada hora** mientras el PC esté prendido;
   - crea dos accesos en el escritorio: **"Aragon en linea - archivos"** (la carpeta) y **"Aragon en linea - publicar ahora"**.
4. Al final debe decir **LISTO**. Ya puede borrar el ZIP y la carpeta descomprimida.

Para **cambiar la clave** (por ejemplo, si la revocó), vuelva a correr `INSTALAR.bat` y escriba **S** cuando pregunte si quiere reemplazarla.

### A.3 Pruebas y entrega

Durante el desarrollo el programa se instala y se prueba en el PC del administrador de la página, con datos de prueba. Al **entregar** la plataforma:

1. En el PC de pruebas: doble clic en `sync\DESINSTALAR.bat` (quita la tarea programada, los accesos directos y el programa con su clave; deja las carpetas de archivos como respaldo).
2. En Supabase → Secret keys: **borre** la clave que usaba ese PC.
3. En el PC de la oficina: cree una clave nueva (A.1) e instale (A.2).

## Parte B · Uso diario (administradora)

Abra en el escritorio **"Aragon en linea - archivos"**. Verá:

```
C:\Aragon en linea\
  Para subir\
    Cartera\          ← aquí el Excel de cartera del mes
    Informes\         ← aquí el Excel del informe del mes
    Documentos\
      Copropietarios\<categoría>\   ← PDF para propietarios, consejo y administración
      Solo consejo\<categoría>\     ← PDF solo para el consejo
  Publicados\         ← lo que ya se publicó (respaldo, por fecha)
  Con errores\        ← lo que no se publicó, con un aviso "QUE CORREGIR"
  ULTIMO RESULTADO.txt ← qué pasó la última vez
```

1. **Copie** el archivo en la carpeta que corresponde.
2. Espere a que corra solo (al prender el PC y cada hora) o haga doble clic en **"Aragon en linea - publicar ahora"**. El programa no toca un archivo copiado hace menos de un minuto (por si todavía se está copiando).
3. Abra **ULTIMO RESULTADO.txt**:
   - **PUBLICADO**: listo; el archivo pasó a *Publicados*.
   - **CON ERRORES**: el archivo pasó a *Con errores* junto con un aviso **"… - QUE CORREGIR.txt"** que dice qué arreglar. Corríjalo y vuelva a ponerlo en *Para subir*.
   - **PENDIENTE**: no había internet (o la clave falló). El archivo se queda en *Para subir* y se intenta de nuevo en la próxima vuelta.

### Cartera

La **plantilla de cartera** (la misma del panel) tiene una hoja **Control**: la contadora escribe en la celda amarilla el **total de la cartera según el informe contable**. Si el total del archivo no es igual, no se publica.

### Informe del mes

La **plantilla de informe mensual** tiene una hoja **Control** con: año, mes, total de ingresos, total de gastos y, si hay hoja de pagos, total de pagos, tal como dice el informe contable. El presupuesto del año se sigue publicando desde el panel.

### Documentos (PDF)

- Póngalo en `Copropietarios\<categoría>` o en `Solo consejo\<categoría>` (Actas de asamblea, Actas de consejo, Estados financieros, Informes de gestión, Contratos, Pólizas, Otros).
- **Nombre del archivo:** `AAAA-MM-DD Título.pdf`, con la fecha del documento. Ejemplo: `2026-03-14 Acta de asamblea ordinaria 2026.pdf`. Sin fecha al comienzo, se usa la fecha del archivo.
- Al ponerlo en la carpeta, **usted confirma que el documento ya fue revisado**. El programa borra los datos ocultos del archivo y busca correos, celulares y cédulas: si encuentra algo, o si alguna página es escaneada (imagen), **no lo publica** y le pide subirlo desde el **panel**, donde puede usar **Tapar datos** (recuadros negros y sello "Original firmado").

## Si algo falla

| Situación | Qué hacer |
|---|---|
| ULTIMO RESULTADO dice que **falta la clave** o que **Supabase rechazó la clave** | El administrador de la página vuelve a correr `INSTALAR.bat` con una clave secreta válida. |
| No pasa nada al poner archivos | Haga doble clic en "publicar ahora". Si sigue igual, en el **Programador de tareas** de Windows revise que exista y esté habilitada la tarea "Aragon en linea - publicar". |
| El PC se dañó o se cambia | En Supabase **borre** la clave `pc_administracion` e instale de nuevo en el PC nuevo con una clave nueva. |
| Se publicó algo equivocado | En el panel, pestaña correspondiente → **Anular** (cartera e informes) o **Retirar** (documentos). |

El programa guarda un historial en `C:\Aragon en linea\registro.txt`.
