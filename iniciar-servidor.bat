@echo off
chcp 65001 >nul
title Boleia - servidor
cd /d "%~dp0server"
if not exist node_modules (
  echo A instalar dependencias do servidor...
  call npm.cmd install || goto erro
)
echo A iniciar o servidor Boleia (porta 3000). Deixe esta janela aberta.
call npm.cmd start
goto fim
:erro
echo.
echo Ocorreu um erro. Verifique se o Node.js esta instalado (https://nodejs.org).
:fim
pause
