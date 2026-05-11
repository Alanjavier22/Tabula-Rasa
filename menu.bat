@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $global:SCRIPT_DIR = '%~dp0'.TrimEnd('\'); & ([scriptblock]::Create([System.IO.File]::ReadAllText('%~dp0menu.ps1', [System.Text.Encoding]::UTF8)))"
