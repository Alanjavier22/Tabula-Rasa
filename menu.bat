@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0menu.ps1" %*
exit /b %ERRORLEVEL%
