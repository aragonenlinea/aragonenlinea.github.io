@echo off
rem Doble clic para desinstalar el programa del PC (Aragon en linea). No borra los archivos ya publicados.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar.ps1"
echo.
pause
