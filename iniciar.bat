@echo off
title Servidor Local - Suite U3
cd /d "%~dp0"

echo ===================================================
echo     Iniciando Servidor Local de Suite U3...
echo ===================================================
echo.
echo Abriendo navegador en http://localhost:3000 ...
start http://localhost:3000
echo.
echo Ejecutando servidor de desarrollo...
echo Presiona Ctrl + C en esta ventana para detenerlo.
echo ===================================================
echo.

npm run dev

pause