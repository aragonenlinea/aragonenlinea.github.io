# Desinstalador del programa del PC - Aragon en linea
# Quita la tarea programada, los accesos directos del escritorio y el programa con su clave.
# NO borra las carpetas de archivos (Para subir, Publicados, Con errores): quedan como respaldo.
# Despues de desinstalar, borre tambien la clave en Supabase (Project Settings > API Keys > Secret keys).
$Raiz = "C:\Aragon en linea"
$Tarea = "Aragon en linea - publicar"

Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false -ErrorAction SilentlyContinue
$escritorio = [Environment]::GetFolderPath("Desktop")
foreach ($n in "Aragon en linea - archivos.lnk", "Aragon en linea - publicar ahora.lnk") {
  Remove-Item (Join-Path $escritorio $n) -Force -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path $Raiz "programa") -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Programa desinstalado. Las carpetas de archivos siguen en $Raiz (puede borrarlas si no las necesita)." -ForegroundColor Cyan
Write-Host "Falta: borrar la clave 'pc-administracion' en Supabase > Project Settings > API Keys > Secret keys." -ForegroundColor Yellow
