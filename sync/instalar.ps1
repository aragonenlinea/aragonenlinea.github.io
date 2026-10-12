# Instalador del programa del PC de la administracion - Aragon en linea
# Lo corre el ADMINISTRADOR DE LA PAGINA en el PC de la administracion (doble clic en INSTALAR.bat).
# 1. Instala Python si falta  2. Instala las librerias  3. Copia el programa a C:\Aragon en linea\programa
# 4. Pide la clave secreta de Supabase (no se ve en pantalla; queda solo en ese PC)
# 5. Programa la tarea de Windows (al iniciar sesion y cada hora)  6. Crea accesos directos en el escritorio
$ErrorActionPreference = "Stop"
$Raiz = "C:\Aragon en linea"
$Programa = Join-Path $Raiz "programa"
$Origen = $PSScriptRoot
$Url = "https://bljgybxgkcpnlwlvflss.supabase.co"
$Tarea = "Aragon en linea - publicar"

function Paso($texto) { Write-Host ""; Write-Host "== $texto" -ForegroundColor Green }
function BuscarPython {
  try {
    $ruta = & py -3 -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0 -and $ruta) { return $ruta.Trim() }
  } catch { }
  return $null
}

try {
  Write-Host "Aragon en linea - instalador del programa del PC de la administracion" -ForegroundColor Cyan

  Paso "1 de 6. Python"
  $py = BuscarPython
  if (-not $py) {
    Write-Host "Python no esta instalado. Instalando Python 3.12 (puede tardar unos minutos)..."
    winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
    $py = BuscarPython
    if (-not $py) { throw "No se pudo instalar Python. Instalelo desde https://www.python.org/downloads/ (marque 'Add python.exe to PATH') y vuelva a correr este instalador." }
  }
  Write-Host "Python: $py"
  $pyw = Join-Path (Split-Path $py) "pythonw.exe"

  Paso "2 de 6. Librerias"
  & $py -m pip install --user --upgrade --disable-pip-version-check -r (Join-Path $Origen "requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las librerias. Revise la conexion a internet y vuelva a intentarlo." }

  Paso "3 de 6. Programa y carpetas"
  New-Item -ItemType Directory -Force $Programa | Out-Null
  foreach ($f in "aragon_sync.py", "revision_pdf.py", "requirements.txt") { Copy-Item (Join-Path $Origen $f) $Programa -Force }
  Write-Host "Programa copiado en $Programa"

  Paso "4 de 6. Clave secreta de Supabase"
  $archivoEnv = Join-Path $Programa ".env"
  $pedir = $true
  if (Test-Path $archivoEnv) {
    $resp = Read-Host "Ya hay una clave guardada en este PC. Escriba S y Enter para reemplazarla, o solo Enter para conservarla"
    $pedir = ($resp -eq "S" -or $resp -eq "s")
  }
  if ($pedir) {
    Write-Host "Supabase > Project Settings > API Keys > Secret keys > copie la clave (empieza por sb_secret_)."
    $segura = Read-Host "Pegue la clave aqui (no se vera mientras la pega) y presione Enter" -AsSecureString
    $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)).Trim()
    if ($clave -notmatch '^(sb_secret_|eyJ)') { throw "Eso no parece la clave secreta (debe empezar por sb_secret_). No pegue la clave publica (sb_publishable_)." }
    Set-Content -Path $archivoEnv -Encoding ASCII -Value @(
      "# Clave del programa del PC de la administracion. NO compartir, NO subir al repositorio.",
      "SUPABASE_URL=$Url", "SUPABASE_CLAVE_SECRETA=$clave", "CARPETA=$Raiz")
    # Solo el usuario de Windows actual puede leer el archivo de la clave.
    icacls $archivoEnv /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    Remove-Variable clave, segura
  }
  & $py (Join-Path $Programa "aragon_sync.py") --probar
  if ($LASTEXITCODE -ne 0) { throw "La prueba de conexion fallo. Revise la clave y vuelva a correr el instalador." }
  & $py (Join-Path $Programa "aragon_sync.py")   # primera vuelta: crea las carpetas

  Paso "5 de 6. Tarea programada de Windows"
  $accion = New-ScheduledTaskAction -Execute $pyw -Argument "`"$Programa\aragon_sync.py`"" -WorkingDirectory $Programa
  $alEntrar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $cadaHora = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $alEntrar, $cadaHora -Settings $ajustes -Force `
    -Description "Publica en Aragon en linea lo que se ponga en C:\Aragon en linea\Para subir (al iniciar sesion y cada hora)." | Out-Null
  Write-Host "Tarea '$Tarea' creada: corre al iniciar sesion y cada hora mientras el PC este prendido."

  Paso "6 de 6. Accesos directos en el escritorio"
  $shell = New-Object -ComObject WScript.Shell
  $escritorio = [Environment]::GetFolderPath("Desktop")
  $a = $shell.CreateShortcut((Join-Path $escritorio "Aragon en linea - archivos.lnk"))
  $a.TargetPath = $Raiz; $a.Save()
  $b = $shell.CreateShortcut((Join-Path $escritorio "Aragon en linea - publicar ahora.lnk"))
  $b.TargetPath = $pyw; $b.Arguments = "`"$Programa\aragon_sync.py`""; $b.WorkingDirectory = $Programa; $b.Save()

  Write-Host ""
  Write-Host "LISTO. Ponga los archivos en '$Raiz\Para subir' y revise '$Raiz\ULTIMO RESULTADO.txt'." -ForegroundColor Cyan
} catch {
  Write-Host ""
  Write-Host "NO SE TERMINO LA INSTALACION: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
