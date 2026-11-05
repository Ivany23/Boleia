@echo off
chcp 65001 >nul
title Boleia - app (Expo)
cd /d "%~dp0app"
if not exist node_modules (
  echo A instalar dependencias da app...
  call npm.cmd install || goto erro
)
echo Leia o codigo QR com o Expo Go. O telemovel tem de estar no mesmo Wi-Fi que o PC.
call npx.cmd expo start -c
goto fim
:erro
echo.
echo Ocorreu um erro. Verifique se o Node.js esta instalado (https://nodejs.org).
:fim
pause
