@echo off
chcp 65001 >nul

:: Auto-elevar a Administrador si no lo somos
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $global:SCRIPT_DIR = '%~dp0'.TrimEnd('\'); & ([scriptblock]::Create([System.IO.File]::ReadAllText('%~dp0menu.ps1', [System.Text.Encoding]::UTF8)))"
