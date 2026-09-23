# Menú interactivo para Finanzas Personales (Versión Enterprise)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- CONFIGURACIÓN DE RUTAS (ALCANCE GLOBAL) ---
# Usamos la ubicación real del script, tanto desde menu.bat como directamente.
$script:scriptPath = $PSScriptRoot
if (-not $script:scriptPath) { $script:scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $script:scriptPath) { $script:scriptPath = $PSScriptRoot }
if (-not $script:scriptPath) { $script:scriptPath = "." } # Fallback al directorio actual

$script:backendPath = Join-Path $script:scriptPath "backend"
$script:frontendPath = Join-Path $script:scriptPath "frontend"
$script:backendLog = Join-Path $script:scriptPath "backend.log"
$script:frontendLog = Join-Path $script:scriptPath "frontend.log"
$script:backendErrorLog = Join-Path $script:scriptPath "backend_error.log"
$script:frontendErrorLog = Join-Path $script:scriptPath "frontend_error.log"
$script:venvPython = Join-Path $script:backendPath "venv\Scripts\python.exe"
$script:nodeModules = Join-Path $script:frontendPath "node_modules"
$script:runDirectory = Join-Path $script:scriptPath ".run"
$script:backendPidFile = Join-Path $script:runDirectory "backend.pid"
$script:frontendPidFile = Join-Path $script:runDirectory "frontend.pid"
$script:uvicornHost = if ([string]::IsNullOrWhiteSpace($env:UVICORN_HOST)) { "127.0.0.1" } else { $env:UVICORN_HOST }

New-Item -ItemType Directory -Force -Path $script:runDirectory | Out-Null

# --- SISTEMA DE INSTALACIÓN AUTÓNOMA ---

# Función para refrescar el PATH de la sesión actual
function Refresh-SessionPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path","Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path","User")
    $processPath = $env:Path
    $env:Path = (($machinePath, $userPath, $processPath) -split ';' |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique) -join ';'
}

function Get-UsableCommand {
    param([string]$Name)

    $windowsApps = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps"
    return Get-Command $Name -CommandType Application -All -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -notlike "$windowsApps\*" } |
        Select-Object -First 1
}

# Verificar si winget está disponible
function Test-WingetAvailable {
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    return ($null -ne $wingetCmd)
}

# Instalar Python directamente descargándolo (fallback si no hay winget)
function Install-PythonDirect {
    $pythonVersion = "3.12.8"
    $installerUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-amd64.exe"
    $installerPath = Join-Path $env:TEMP ("tabula-rasa-python-{0}.exe" -f [guid]::NewGuid())

    Write-Host "  Descargando Python $pythonVersion..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing | Out-Null
        $signature = Get-AuthenticodeSignature -FilePath $installerPath
        if ($signature.Status -ne "Valid") {
            throw "La firma Authenticode del instalador de Python no es válida ($($signature.Status))."
        }

        Write-Host "  Instalando Python $pythonVersion (silencioso)..." -ForegroundColor Cyan
        $installArgs = "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=1"
        $installerProcess = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
        if ($installerProcess.ExitCode -notin @(0, 3010)) {
            throw "El instalador de Python terminó con código $($installerProcess.ExitCode)."
        }
        Refresh-SessionPath
        return ($null -ne (Get-UsableCommand "python"))
    } catch {
        Write-Host "  ERROR: No se pudo instalar Python: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    } finally {
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    }
}

# Instalar Node.js directamente descargándolo (fallback si no hay winget)
function Install-NodeDirect {
    $nodeVersion = "22.12.0"
    $installerUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi"
    $installerPath = Join-Path $env:TEMP ("tabula-rasa-node-{0}.msi" -f [guid]::NewGuid())

    Write-Host "  Descargando Node.js $nodeVersion..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing | Out-Null
        $signature = Get-AuthenticodeSignature -FilePath $installerPath
        if ($signature.Status -ne "Valid") {
            throw "La firma Authenticode del instalador de Node.js no es válida ($($signature.Status))."
        }

        Write-Host "  Instalando Node.js $nodeVersion (silencioso)..." -ForegroundColor Cyan
        $msiArgs = @("/i", $installerPath, "/quiet", "/norestart")
        $installerProcess = Start-Process msiexec.exe -ArgumentList $msiArgs -Wait -PassThru -NoNewWindow
        if ($installerProcess.ExitCode -notin @(0, 3010)) {
            throw "El instalador de Node.js terminó con código $($installerProcess.ExitCode)."
        }
        Refresh-SessionPath
        return ($null -ne (Get-UsableCommand "node"))
    } catch {
        Write-Host "  ERROR: No se pudo instalar Node.js: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    } finally {
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
    }
}

# Función principal de instalación autónoma (sin preguntar)
function Install-Requirement {
    param(
        [string]$Name,
        [string]$Id,
        [string]$DirectInstallType  # "python" o "node"
    )
    
    Write-Host "  $Name no detectado. Instalando automáticamente..." -ForegroundColor Yellow

    $installed = $false

    # Intentar con winget primero
    if (Test-WingetAvailable) {
        Write-Host "  Usando winget para instalar $Name..." -ForegroundColor Cyan
        & winget install --id $Id --source winget --accept-package-agreements --accept-source-agreements --silent *> $null
        $wingetExitCode = $LASTEXITCODE
        if ($wingetExitCode -eq 0 -or $wingetExitCode -eq 3010) {
            Refresh-SessionPath
            if ($DirectInstallType -eq "python") {
                $installed = ($null -ne (Get-UsableCommand "python"))
            } elseif ($DirectInstallType -eq "node") {
                $installed = ($null -ne (Get-UsableCommand "node"))
            }
        }
    }

    # Fallback: descarga directa
    if (-not $installed) {
        Write-Host "  winget no disponible o falló. Usando descarga directa..." -ForegroundColor Yellow
        if ($DirectInstallType -eq "python") {
            $installed = Install-PythonDirect
        } elseif ($DirectInstallType -eq "node") {
            $installed = Install-NodeDirect
        }
    }

    if ($installed) {
        Write-Host "  $Name instalado correctamente." -ForegroundColor Green
        return $true
    } else {
        Write-Host "  ERROR: No se pudo instalar $Name automáticamente." -ForegroundColor Red
        Write-Host "  Por favor, instálalo manualmente desde su web oficial y reinicia el menú." -ForegroundColor Red
        Read-Host "Presiona Enter para salir..."
        exit 1
    }
}

# Validación de versión de Python (requerido: 3.12+)
function Test-PythonVersion {
    $pythonCmd = Get-UsableCommand "python"
    if (-not $pythonCmd) {
        Install-Requirement "Python 3.12" "Python.Python.3.12" "python"
        Refresh-SessionPath
    }
    
    $pythonCmd = Get-UsableCommand "python"
    if (-not $pythonCmd) {
        Write-Host "  ERROR FATAL: Python no se detecta después de la instalación." -ForegroundColor Red
        Write-Host "  Cierra esta ventana, abre una nueva terminal y ejecuta menu.bat de nuevo." -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir..."
        exit 1
    }

    $pythonVersionOutput = & $pythonCmd.Source --version 2>&1
    $versionStr = $pythonVersionOutput -replace "Python ", ""
    
    try {
        $version = [version]$versionStr
        $minVersion = [version]"3.12.0"
        if ($version -lt $minVersion) {
            Write-Host "  Versión de Python antigua ($versionStr). Actualizando a 3.12+..." -ForegroundColor Yellow
            Install-Requirement "Python 3.12" "Python.Python.3.12" "python"
            Refresh-SessionPath
            Write-Host "  Python actualizado. Reinicia el menú para aplicar cambios." -ForegroundColor Green
            Read-Host "Presiona Enter para salir..."
            exit 0
        } else {
            Write-Host "  Python $versionStr detectado" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ERROR: No se pudo interpretar la versión de Python ($versionStr)." -ForegroundColor Red
        exit 1
    }
}

function Test-NodeVersion {
    $nodeCmd = Get-UsableCommand "node"
    if (-not $nodeCmd) {
        Install-Requirement "Node.js" "OpenJS.NodeJS" "node"
        Refresh-SessionPath
    }
    
    # Re-verificar después de posible instalación
    $nodeCmd = Get-UsableCommand "node"
    if (-not $nodeCmd) {
        Write-Host "  ERROR: Node.js no se detecta después de la instalación." -ForegroundColor Red
        Write-Host "  Cierra esta ventana, abre una nueva terminal y ejecuta menu.bat de nuevo." -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir..."
        exit 1
    }

    $nodeVersionOutput = & $nodeCmd.Source --version
    $versionStr = $nodeVersionOutput -replace "^v", ""

    try {
        $version = [version]$versionStr
        $minVersion = [version]"20.19.0"
        if ($version -lt $minVersion) {
            Write-Host "  Versión de Node.js antigua ($versionStr). Actualizando..." -ForegroundColor Yellow
            Install-Requirement "Node.js" "OpenJS.NodeJS" "node"
            Refresh-SessionPath
            Write-Host "  Node.js actualizado. Reinicia el menú para aplicar cambios." -ForegroundColor Green
            Read-Host "Presiona Enter para salir..."
            exit 0
        } else {
            Write-Host "  Node.js $versionStr detectado" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ERROR: No se pudo interpretar la versión de Node.js ($nodeVersionOutput)." -ForegroundColor Red
        exit 1
    }
}

Test-PythonVersion
Test-NodeVersion

# Validación de privilegios de Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  ADVERTENCIA: Sin privilegios de Administrador." -ForegroundColor Red
    Write-Host "   La instalación automática podría requerir permisos." -ForegroundColor Yellow
    Start-Sleep -Seconds 1
}



function Show-Header {
    Write-Host "  ____________________________________________" -ForegroundColor Magenta
    Write-Host "  |                                          |" -ForegroundColor Magenta
    Write-Host "  |   TABULA RASA - Financial Control v2.0   |" -ForegroundColor Cyan
    Write-Host "  |__________________________________________|" -ForegroundColor Magenta
}

function Show-Menu {
    Clear-Host
    Show-Header
    Write-Host ""
    Write-Host "  [1] INICIAR APLICATIVO"  -ForegroundColor Green
    Write-Host "  [2] DETENER SERVICIOS"   -ForegroundColor Yellow
    Write-Host "  [3] VER LOGS (En vivo)"  -ForegroundColor Blue
    Write-Host "  [4] MANTENIMIENTO"       -ForegroundColor Cyan
    Write-Host "  [5] SALIR"               -ForegroundColor Red
    Write-Host ""
    Write-Host "  Estado actual: " -NoNewline; 
    $port8001 = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
    $port5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    if ($port8001 -and $port5173) {
        Write-Host ">>> ONLINE <<<" -ForegroundColor Green 
    } elseif ($port8001) {
        Write-Host ">>> BACKEND ONLINE / FRONTEND OFFLINE <<<" -ForegroundColor Yellow
    } elseif ($port5173) {
        Write-Host ">>> BACKEND OFFLINE / FRONTEND ONLINE <<<" -ForegroundColor Yellow
    } else { 
        Write-Host ">>> OFFLINE <<<" -ForegroundColor Red 
    }
    Write-Host "  --------------------------------------------" -ForegroundColor DarkGray
}

function Stop-ProjectProcesses {
    # Compatibilidad con llamadas antiguas: la parada real siempre queda
    # restringida a procesos identificados por ruta/comando del proyecto.
    return (Stop-SpecificPorts)
}

function Get-ProjectProcessIds {
    # Identifica procesos de ESTE proyecto por ruta, no por puerto - así agarra
    # también al proceso supervisor de "uvicorn --reload" (que no tiene el
    # socket abierto él mismo, solo su worker hijo lo tiene) y no le pega a
    # otros python.exe/node.exe de la máquina que no tengan nada que ver.
    $ids = New-Object System.Collections.Generic.HashSet[int]

    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ExecutablePath -eq $script:venvPython -or
            ($_.CommandLine -and $_.CommandLine -match [regex]::Escape($script:backendPath))
        } |
        ForEach-Object { [void]$ids.Add([int]$_.ProcessId) }

    Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cmd.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($script:frontendPath) } |
        ForEach-Object { [void]$ids.Add([int]$_.ProcessId) }

    return $ids
}

function Stop-SpecificPorts {
    $killedSomething = $false

    # Varias pasadas: un worker de "uvicorn --reload" en crash-loop puede morir
    # y renacer con otro PID entre que lo detectamos y lo matamos. Una sola
    # pasada deja zombies sueltos que se van acumulando entre reinicios - esa
    # fue la causa real de que el puerto 8001 terminara con 5 procesos
    # distintos peleándoselo.
    for ($pass = 1; $pass -le 3; $pass++) {
        $anyThisPass = $false

        # Procesos de este proyecto por ruta/comando. Nunca se mata un PID
        # únicamente porque escuche en uno de los puertos configurados.
        foreach ($processId in (Get-ProjectProcessIds)) {
            & taskkill /F /T /PID $processId 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  PID $processId (árbol del proyecto) detenido." -ForegroundColor Green
                $anyThisPass = $true
            }
        }

        if ($anyThisPass) {
            $killedSomething = $true
            Start-Sleep -Milliseconds 700
        } else {
            break
        }
    }

    if (-not $killedSomething) {
        Write-Host "  No se encontraron procesos del proyecto activos." -ForegroundColor Gray
    }

    foreach ($pidFile in @($script:backendPidFile, $script:frontendPidFile)) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    foreach ($port in @(8001, 5173)) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            Write-Host "  ADVERTENCIA: el puerto $port sigue ocupado; no se detuvo porque el proceso no fue identificado como parte del proyecto." -ForegroundColor Yellow
        }
    }

    return $killedSomething
}

function Remove-VenvSafely {
    param(
        [string]$Path
    )

    $maxRetries = 3
    $attempt = 0

    while ($attempt -lt $maxRetries) {
        $attempt++
        Write-Host "  Intento $attempt/$maxRetries para eliminar $Path..." -ForegroundColor Yellow

        try {
            if (Test-Path $Path) {
                Remove-Item -Recurse -Force $Path -ErrorAction Stop
                Write-Host "  Carpeta eliminada exitosamente." -ForegroundColor Green
                return $true
            } else {
                Write-Host "  La carpeta no existe." -ForegroundColor Gray
                return $true
            }
        } catch {
            Write-Host "  Error al eliminar: $($_.Exception.Message)" -ForegroundColor Red

            if ($attempt -lt $maxRetries) {
                Write-Host "  Limpiando procesos y reintentando..." -ForegroundColor Yellow
                Stop-ProjectProcesses | Out-Null
                Start-Sleep -Seconds 2
            }
        }
    }

    Write-Host "  ERROR: No se pudo eliminar $Path después de $maxRetries intentos." -ForegroundColor Red
    throw "No se pudo eliminar $Path después de $maxRetries intentos"
}

function Stop-AllProcesses {
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Deteniendo Aplicativo de forma segura..."  -ForegroundColor Yellow
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""

    Write-Host "Buscando procesos en puertos 8001 (Backend) y 5173 (Frontend)..." -ForegroundColor Yellow
    
    $result = Stop-SpecificPorts
    
    if (-not $result) {
        Write-Host "  No se encontraron procesos activos en los puertos del aplicativo." -ForegroundColor Gray
    }

    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Aplicativo detenido correctamente"  -ForegroundColor Green
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Presiona Enter para continuar..."
}

function Start-Application {
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Iniciando Aplicativo..."  -ForegroundColor Green
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""

    # 1. Asesino de Zombies Quirúrgico
    Write-Host "[1/5] Verificando puertos limpios..."  -ForegroundColor Yellow
    Stop-SpecificPorts | Out-Null
    Start-Sleep -Seconds 2

    # 2. Rotación de Logs (Limpieza en frío)
    Write-Host "[2/5] Limpiando archivos de log anteriores..." -ForegroundColor Yellow
    Clear-Content $script:backendLog -ErrorAction SilentlyContinue
    Clear-Content $script:frontendLog -ErrorAction SilentlyContinue
    Clear-Content $script:backendErrorLog -ErrorAction SilentlyContinue
    Clear-Content $script:frontendErrorLog -ErrorAction SilentlyContinue

    # 3. Backend Health Check & Self-Healing
    Write-Host "[3/5] Verificando salud del entorno virtual..."  -ForegroundColor Yellow
    $venvPath = Join-Path $script:backendPath "venv"
    $venvNeedsReinstall = $false

    if (Test-Path $script:venvPython) {
        # Check if critical packages and app can be imported
        & $script:venvPython -c "import fastapi, sqlalchemy, pydantic, cryptography, jwt" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Entorno virtual corrupto detectado. Reinstalando..." -ForegroundColor Magenta
            try {
                Remove-VenvSafely $venvPath
                $venvNeedsReinstall = $true
            } catch {
                Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "  Cierra procesos que puedan estar usando el venv e inténtalo de nuevo." -ForegroundColor Yellow
                Read-Host "Presiona Enter para continuar..."
                return
            }
        } else {
            # Try to import the main app module
            & $script:venvPython -c "import sys; sys.path.insert(0, r'$script:backendPath'); from main import app" 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Error al importar aplicación. Reinstalando..." -ForegroundColor Magenta
                try {
                    Remove-VenvSafely $venvPath
                    $venvNeedsReinstall = $true
                } catch {
                    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
                    Write-Host "  Cierra procesos que puedan estar usando el venv e inténtalo de nuevo." -ForegroundColor Yellow
                    Read-Host "Presiona Enter para continuar..."
                    return
                }
            } else {
                Write-Host "  Entorno virtual saludable." -ForegroundColor Green
            }
        }
    } else {
        $venvNeedsReinstall = $true
    }

    if ($venvNeedsReinstall) {
        Write-Host "  Creando entorno virtual e instalando dependencias..." -ForegroundColor Magenta
        
        # Asegurar que python está disponible en el PATH actual
        $pythonExe = Get-UsableCommand "python"
        if (-not $pythonExe) {
            Refresh-SessionPath
            $pythonExe = Get-UsableCommand "python"
        }
        if (-not $pythonExe) {
            Write-Host "  ERROR: Python no está disponible. Ejecuta menu.bat de nuevo." -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }

        # Crear el entorno virtual
        & $pythonExe.Source -m venv $venvPath
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Python no pudo crear el entorno virtual." -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }
        
        if (-not (Test-Path $script:venvPython)) {
            Write-Host "  ERROR: No se pudo crear el entorno virtual." -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }

        # Intentar instalación ultra-rápida con uv, con fallback a pip
        $uvInstalled = $false
        & $script:venvPython -m pip install uv --quiet 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            & $script:venvPython -m uv pip install -r (Join-Path $script:backendPath "requirements.txt")
            if ($LASTEXITCODE -eq 0) { $uvInstalled = $true }
        }

        if (-not $uvInstalled) {
            Write-Host "  uv no disponible, usando pip estándar..." -ForegroundColor Yellow
            & $script:venvPython -m pip install -r (Join-Path $script:backendPath "requirements.txt") --quiet
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Falló la instalación de dependencias. Revisa requirements.txt" -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }
    }

    # 4. Iniciar Backend
    Write-Host "[4/5] Iniciando Backend..."  -ForegroundColor Yellow
    
    # Inicia como proceso oculto, enrutando StdOut y StdErr al Log
    $backendProcess = Start-Process -FilePath $script:venvPython -ArgumentList "-m uvicorn main:app --host $script:uvicornHost --port 8001 --reload" -WorkingDirectory $script:backendPath -WindowStyle Hidden -RedirectStandardOutput $script:backendLog -RedirectStandardError $script:backendErrorLog -PassThru
    $backendProcess.Id | Set-Content -Path $script:backendPidFile -Encoding ascii

    # Health Check Polling (Evitar Race Condition)
    Write-Host "  Esperando a que el backend esté listo..." -ForegroundColor Yellow
    $maxRetries = 15
    $retryCount = 0
    $backendReady = $false
    
    while ($retryCount -lt $maxRetries) {
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:8001/health" | Out-Null
            $backendReady = $true
            break
        } catch {
            $retryCount++
            Start-Sleep -Seconds 1
        }
    }
    
    if (-not $backendReady) {
        Write-Host "  ERROR: El backend no respondió después de $maxRetries segundos." -ForegroundColor Red
        if ((Test-Path $script:backendErrorLog) -and (Get-Item $script:backendErrorLog).Length -gt 0) {
            Write-Host ""
            Write-Host "  --- Últimas líneas de backend_error.log ---" -ForegroundColor Yellow
            Get-Content $script:backendErrorLog -Tail 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
            Write-Host "  --------------------------------------------" -ForegroundColor Yellow
        }
        Stop-SpecificPorts | Out-Null
        Read-Host "Presiona Enter para continuar..."
        return
    }
    
    Write-Host "  Backend listo." -ForegroundColor Green

    # 5. Frontend (Self-Healing + Start)
    Write-Host "[5/5] Preparando e Iniciando Frontend..."  -ForegroundColor Yellow
    if (-not (Test-Path $script:nodeModules)) {
        Write-Host "  Dependencias de Node no detectadas. Instalando..." -ForegroundColor Magenta
        Push-Location $script:frontendPath
        $npmInstallCommand = "install"
        $npmInstallExitCode = 1
        try {
            $npmInstallCommand = if (Test-Path (Join-Path $script:frontendPath "package-lock.json")) { "ci" } else { "install" }
            & npm $npmInstallCommand
            $npmInstallExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        if ($npmInstallExitCode -ne 0) {
            Write-Host "  ERROR: npm $npmInstallCommand falló con código $npmInstallExitCode." -ForegroundColor Red
            Stop-SpecificPorts | Out-Null
            Read-Host "Presiona Enter para continuar..."
            return
        }
    }

    # Inicia Vite oculto enrutando logs
    $frontendCommand = "/d /c `"set `"TABULA_RASA_PROJECT_ROOT=$script:frontendPath`" && npm run dev -- --host 127.0.0.1`""
    $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList $frontendCommand -WorkingDirectory $script:frontendPath -WindowStyle Hidden -RedirectStandardOutput $script:frontendLog -RedirectStandardError $script:frontendErrorLog -PassThru
    $frontendProcess.Id | Set-Content -Path $script:frontendPidFile -Encoding ascii

    $frontendReady = $false
    for ($retry = 0; $retry -lt 15; $retry++) {
        try {
            Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2 | Out-Null
            $frontendReady = $true
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $frontendReady) {
        Write-Host "  ERROR: El frontend no respondió después de 15 segundos." -ForegroundColor Red
        if ((Test-Path $script:frontendErrorLog) -and (Get-Item $script:frontendErrorLog).Length -gt 0) {
            Get-Content $script:frontendErrorLog -Tail 20 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
        }
        Stop-SpecificPorts | Out-Null
        Read-Host "Presiona Enter para continuar..."
        return
    }

    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Aplicativo en ejecución en segundo plano"  -ForegroundColor Green
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Backend:  http://localhost:8001"  -ForegroundColor Cyan
    Write-Host "  Frontend: http://localhost:5173"  -ForegroundColor Cyan
    Write-Host ""
    
    # Abrir navegador
    Start-Process "http://localhost:5173"

    Read-Host "Presiona Enter para volver al menú..."
}

function Show-LogTail {
    param(
        [string]$Path,
        [string]$Name
    )

    Write-Host ""
    if (-not (Test-Path $Path)) {
        Write-Host "Log vacío o no existe." -ForegroundColor Red
        Read-Host "Presiona Enter para continuar..."
        return
    }

    Write-Host "Mostrando $Name en vivo. Presiona cualquier tecla para volver al menú." -ForegroundColor Cyan
    Write-Host ""

    if ([Console]::IsInputRedirected) {
        Get-Content $Path -Tail 30 -Wait
        return
    }

    try {
        Get-Content $Path -Tail 30 | ForEach-Object { Write-Host $_ }
    } catch {
        Write-Host "No se pudo leer el log: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Presiona Enter para continuar..."
        return
    }

    # Se abre con FileShare ReadWrite para no bloquear al proceso que sigue escribiendo el log
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    } catch {
        Write-Host "No se pudo abrir el log: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Presiona Enter para continuar..."
        return
    }
    $reader = New-Object System.IO.StreamReader($stream)
    $reader.BaseStream.Seek(0, [System.IO.SeekOrigin]::End) | Out-Null

    try {
        while ($true) {
            $keyAvailable = $false
            try {
                $keyAvailable = [Console]::KeyAvailable
            } catch {
                break
            }
            if ($keyAvailable) {
                [Console]::ReadKey($true) | Out-Null
                break
            }
            $line = $reader.ReadLine()
            if ($null -ne $line) {
                Write-Host $line
            } else {
                Start-Sleep -Milliseconds 300
            }
        }
    } finally {
        $reader.Close()
        $stream.Close()
    }
}

function Show-Logs {
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Logs Disponibles (Lectura en Vivo)"  -ForegroundColor Blue
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Backend Log"  -ForegroundColor Green
    Write-Host "  [2] Frontend Log"  -ForegroundColor Green
    Write-Host "  [3] Backend Error Log"  -ForegroundColor Red
    Write-Host "  [4] Frontend Error Log"  -ForegroundColor Red
    Write-Host "  [5] Volver"  -ForegroundColor Yellow
    Write-Host ""

    $choice = Read-Host "Selecciona una opción"

    switch ($choice) {
        '1' { Show-LogTail -Path $script:backendLog -Name "Backend Log" }
        '2' { Show-LogTail -Path $script:frontendLog -Name "Frontend Log" }
        '3' { Show-LogTail -Path $script:backendErrorLog -Name "Backend Error Log" }
        '4' { Show-LogTail -Path $script:frontendErrorLog -Name "Frontend Error Log" }
        '5' { return }
    }
}

# Bucle principal
while ($true) {
    Show-Menu
    $choice = Read-Host "Selecciona una opción"

    switch ($choice) {
        '1' { Start-Application }
        '2' { Stop-AllProcesses }
        '3' { Show-Logs }
        '4' {
            $maintenanceConfirmation = Read-Host "Esto eliminará backend\venv y frontend\node_modules. Escribe LIMPIAR para confirmar"
            if ($maintenanceConfirmation -ne "LIMPIAR") {
                Write-Host "Mantenimiento cancelado." -ForegroundColor Yellow
                Read-Host "Presiona Enter para continuar..."
                continue
            }
            Write-Host "Iniciando mantenimiento profundo..." -ForegroundColor Cyan
            Stop-SpecificPorts | Out-Null
            try {
                Remove-VenvSafely (Join-Path $script:backendPath "venv")
                if (Test-Path $script:nodeModules) { Remove-Item -Recurse -Force $script:nodeModules }
                Write-Host "Limpieza completada. Inicia de nuevo para reinstalar todo." -ForegroundColor Green
            } catch {
                Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "No se pudo completar la limpieza. Cierra procesos relacionados e inténtalo de nuevo." -ForegroundColor Yellow
            }
            Read-Host "Presiona Enter para continuar..."
        }
        '5' {
            Write-Host "Cerrando aplicativo de forma segura..." -ForegroundColor Yellow
            Stop-SpecificPorts | Out-Null
            exit
        }
    }
}
