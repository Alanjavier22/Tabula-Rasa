# Menú interactivo para Finanzas Personales (Versión Enterprise)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- CONFIGURACIÓN DE RUTAS (ALCANCE GLOBAL) ---
# Usamos SCRIPT_DIR que viene definido desde el .bat
$script:scriptPath = $global:SCRIPT_DIR
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

# --- SISTEMA DE INSTALACIÓN AUTÓNOMA ---

# Función para refrescar el PATH de la sesión actual
function Refresh-SessionPath {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Desactivar los App Execution Aliases de Windows Store para python
function Disable-PythonStoreAliases {
    $aliasesPath = "$env:LOCALAPPDATA\Microsoft\WindowsApps"
    foreach ($alias in @("python.exe", "python3.exe")) {
        $fullPath = Join-Path $aliasesPath $alias
        if (Test-Path $fullPath) {
            $target = Get-Item $fullPath -ErrorAction SilentlyContinue
            # Los aliases de la Store son archivos de 0 bytes
            if ($target -and $target.Length -eq 0) {
                try {
                    Remove-Item $fullPath -Force -ErrorAction SilentlyContinue
                    Write-Host "  Alias de Windows Store '$alias' desactivado." -ForegroundColor Gray
                } catch { }
            }
        }
    }
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
    $installerPath = Join-Path $env:TEMP "python-installer.exe"

    Write-Host "  Descargando Python $pythonVersion..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    } catch {
        Write-Host "  ERROR: No se pudo descargar Python. Verifica tu conexión a Internet." -ForegroundColor Red
        return $false
    }

    Write-Host "  Instalando Python $pythonVersion (silencioso)..." -ForegroundColor Cyan
    $installArgs = "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_launcher=1"
    Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

    Refresh-SessionPath
    $check = Get-Command python -ErrorAction SilentlyContinue
    return ($null -ne $check)
}

# Instalar Node.js directamente descargándolo (fallback si no hay winget)
function Install-NodeDirect {
    $nodeVersion = "22.12.0"
    $installerUrl = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi"
    $installerPath = Join-Path $env:TEMP "node-installer.msi"

    Write-Host "  Descargando Node.js $nodeVersion..." -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    } catch {
        Write-Host "  ERROR: No se pudo descargar Node.js. Verifica tu conexión a Internet." -ForegroundColor Red
        return $false
    }

    Write-Host "  Instalando Node.js $nodeVersion (silencioso)..." -ForegroundColor Cyan
    Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /quiet /norestart" -Wait -NoNewWindow
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue

    Refresh-SessionPath
    $check = Get-Command node -ErrorAction SilentlyContinue
    return ($null -ne $check)
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
        winget install --id $Id --source winget --accept-package-agreements --accept-source-agreements --silent 2>&1 | Out-Null
        Refresh-SessionPath
        
        if ($DirectInstallType -eq "python") {
            $installed = ($null -ne (Get-Command python -ErrorAction SilentlyContinue))
        } elseif ($DirectInstallType -eq "node") {
            $installed = ($null -ne (Get-Command node -ErrorAction SilentlyContinue))
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
    # Primero desactivar los aliases fantasma de Windows Store
    Disable-PythonStoreAliases

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCmd) {
        Install-Requirement "Python 3.12" "Python.Python.3.12" "python"
        Refresh-SessionPath
    }
    
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCmd) {
        Write-Host "  ERROR FATAL: Python no se detecta después de la instalación." -ForegroundColor Red
        Write-Host "  Cierra esta ventana, abre una nueva terminal y ejecuta menu.bat de nuevo." -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir..."
        exit 1
    }

    $pythonVersionOutput = python --version 2>&1
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
        Write-Host "  Python detectado" -ForegroundColor Green
    }
}

function Test-NodeVersion {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Install-Requirement "Node.js" "OpenJS.NodeJS" "node"
        Refresh-SessionPath
    }
    
    # Re-verificar después de posible instalación
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Host "  ERROR: Node.js no se detecta después de la instalación." -ForegroundColor Red
        Write-Host "  Cierra esta ventana, abre una nueva terminal y ejecuta menu.bat de nuevo." -ForegroundColor Yellow
        Read-Host "Presiona Enter para salir..."
        exit 1
    }

    $nodeVersion = node --version
    Write-Host "  Node.js $nodeVersion detectado" -ForegroundColor Green
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
    if ($port8001) { 
        Write-Host ">>> ONLINE <<<" -ForegroundColor Green 
    } else { 
        Write-Host ">>> OFFLINE <<<" -ForegroundColor Red 
    }
    Write-Host "  --------------------------------------------" -ForegroundColor DarkGray
}

function Stop-ProjectProcesses {
    Write-Host "  Limpiando procesos Python, Node y cmd huérfanos..." -ForegroundColor Yellow
    $killedSomething = $false

    # 1. Matar procesos por puertos (mas preciso que por nombre)
    $portKilled = Stop-SpecificPorts
    if ($portKilled) { $killedSomething = $true }

    # 2. Matar procesos Python que pertenezcan a nuestro venv
    $pythonProcesses = Get-Process -Name "python*" -ErrorAction SilentlyContinue
    if ($pythonProcesses) {
        foreach ($proc in $pythonProcesses) {
            try {
                # Solo matar si el ejecutable esta en nuestro venv
                if ($proc.Path -and $proc.Path -like "*$script:backendPath*") {
                    Stop-Process -Id $proc.Id -Force
                    Write-Host "  Proceso $($proc.ProcessName) (PID: $($proc.Id)) detenido." -ForegroundColor Green
                    $killedSomething = $true
                }
            } catch {
                # Path puede no estar accesible, ignorar
            }
        }
    }

    # 3. Matar procesos Node que pertenezcan a nuestro frontend
    $nodeProcesses = Get-Process -Name "node*" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        foreach ($proc in $nodeProcesses) {
            try {
                if ($proc.Path -and $proc.Path -like "*$script:frontendPath*") {
                    Stop-Process -Id $proc.Id -Force
                    Write-Host "  Proceso $($proc.ProcessName) (PID: $($proc.Id)) detenido." -ForegroundColor Green
                    $killedSomething = $true
                }
            } catch {
                # Path puede no estar accesible, ignorar
            }
        }
    }

    # 4. Matar procesos cmd.exe que lanzamos para backend/frontend
    # Buscar cmd.exe que tengan uvicorn o npm run dev en su linea de comandos
    $cmdProcesses = Get-WmiObject Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue
    if ($cmdProcesses) {
        foreach ($proc in $cmdProcesses) {
            $cmdLine = $proc.CommandLine
            if ($cmdLine -and ($cmdLine -like '*uvicorn*' -or $cmdLine -like '*npm run dev*')) {
                try {
                    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
                    Write-Host "  Proceso cmd.exe huérfano (PID: $($proc.ProcessId)) detenido." -ForegroundColor Green
                    $killedSomething = $true
                } catch {
                    # Ya muerto, ignorar
                }
            }
        }
    }

    if (-not $killedSomething) {
        Write-Host "  No se encontraron procesos activos del proyecto." -ForegroundColor Gray
    }

    # Dar tiempo al SO para liberar descriptores de archivos
    Start-Sleep -Seconds 2
    return $killedSomething
}

function Stop-SpecificPorts {
    $ports = @(8001, 5173)
    $killedSomething = $false

    foreach ($port in $ports) {
        # Buscamos quién tiene secuestrado el puerto
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($connections) {
            foreach ($conn in $connections) {
                try {
                    $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                    if ($process) {
                        Stop-Process -Id $process.Id -Force
                        Write-Host "  Proceso $($process.ProcessName) (PID: $($process.Id)) detenido en puerto $port." -ForegroundColor Green
                        $killedSomething = $true
                    }
                } catch {
                    Write-Host "  Error al detener proceso en puerto $port." -ForegroundColor Red
                }
            }
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

    Write-Host "  Buscando y deteniendo todos los procesos del proyecto..." -ForegroundColor Yellow
    
    $result = Stop-ProjectProcesses
    
    if (-not $result) {
        Write-Host "  No se encontraron procesos activos del proyecto." -ForegroundColor Gray
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

    # 1. Limpieza completa de procesos anteriores
    Write-Host "[1/5] Deteniendo procesos anteriores..."  -ForegroundColor Yellow
    Stop-ProjectProcesses | Out-Null

    # 2. Rotacion de Logs (Eliminacion en frio para evitar bytes nulos por sparse files)
    Write-Host "[2/5] Limpiando archivos de log anteriores..." -ForegroundColor Yellow
    $logFiles = @($script:backendLog, $script:frontendLog, $script:backendErrorLog, $script:frontendErrorLog)
    foreach ($logFile in $logFiles) {
        if (Test-Path $logFile) {
            # Eliminar el archivo por completo. El proceso nuevo lo recrea limpio.
            # Esto evita bytes nulos que ocurren al truncar un archivo que otro proceso mantiene abierto.
            $deleted = $false
            for ($i = 0; $i -lt 3 -and -not $deleted; $i++) {
                try {
                    Remove-Item $logFile -Force -ErrorAction Stop
                    $deleted = $true
                } catch {
                    Start-Sleep -Milliseconds 500
                }
            }
            # Si no se pudo eliminar (proceso lo tiene bloqueado), truncar como fallback
            if (-not $deleted) {
                try {
                    $stream = [System.IO.File]::Open($logFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
                    $stream.SetLength(0)
                    $stream.Close()
                } catch { }
            }
        }
    }

    # 3. Backend Health Check & Self-Healing
    Write-Host "[3/5] Verificando salud del entorno virtual..."  -ForegroundColor Yellow
    $venvPath = Join-Path $script:backendPath "venv"
    $venvNeedsReinstall = $false

    if (Test-Path $script:venvPython) {
        # Check if critical packages and app can be imported
        & $script:venvPython -c "import fastapi, sqlalchemy, pydantic, cryptography" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Entorno virtual corrupto detectado. Reinstalando..." -ForegroundColor Magenta
            Remove-VenvSafely $venvPath
            $venvNeedsReinstall = $true
        } else {
            # Try to import the main app module
            & $script:venvPython -c "import sys; sys.path.insert(0, r'$script:backendPath'); from main import app" 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Error al importar aplicación. Reinstalando..." -ForegroundColor Magenta
                Remove-VenvSafely $venvPath
                $venvNeedsReinstall = $true
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
        $pythonExe = Get-Command python -ErrorAction SilentlyContinue
        if (-not $pythonExe) {
            Refresh-SessionPath
            $pythonExe = Get-Command python -ErrorAction SilentlyContinue
        }
        if (-not $pythonExe) {
            Write-Host "  ERROR: Python no está disponible. Ejecuta menu.bat de nuevo." -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }

        # Crear el entorno virtual
        & $pythonExe.Source -m venv $venvPath
        
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

    # 4. Iniciar Backend y Frontend
    Write-Host "[4/5] Iniciando Backend..."  -ForegroundColor Yellow
    
    # Asegurar dependencias de frontend antes de arrancar
    if (-not (Test-Path $script:nodeModules)) {
        Write-Host "  Dependencias de Node no detectadas. Instalando..." -ForegroundColor Magenta
        Push-Location $script:frontendPath
        npm install
        Pop-Location
    }

    # Inicia backend via cmd.exe con redireccion UTF-8 nativa para stderr
    $backendErrorLog = $script:backendErrorLog
    $frontendErrorLog = $script:frontendErrorLog
    $beCmd = "/c cd /d `"$script:backendPath`" & `"$script:venvPython`" -m uvicorn main:app --host 0.0.0.0 --port 8001 --no-use-colors 1>NUL 2>`"$backendErrorLog`""
    Start-Process -FilePath "cmd.exe" -ArgumentList $beCmd -WindowStyle Hidden

    # Inicia frontend via cmd.exe (sin redireccion - la redireccion causa que cmd muera)
    $feCmd = "/c cd /d `"$script:frontendPath`" && npm.cmd run dev"
    Start-Process -FilePath "cmd.exe" -ArgumentList $feCmd -WindowStyle Hidden

    # Health Check Polling (Evitar Race Condition)
    Write-Host "  Esperando a que el backend esté listo..." -ForegroundColor Yellow
    $maxRetries = 15
    $retryCount = 0
    $backendReady = $false
    
    while ($retryCount -lt $maxRetries) {
        try {
            Invoke-RestMethod -Uri "http://127.0.0.1:8001/health" -ErrorAction SilentlyContinue | Out-Null
            $backendReady = $true
            break
        } catch {
            $retryCount++
            Start-Sleep -Seconds 1
        }
    }
    
    if (-not $backendReady) {
        Write-Host "  ERROR: El backend no respondió después de $maxRetries segundos." -ForegroundColor Red
        Read-Host "Presiona Enter para continuar..."
        return
    }
    
    Write-Host "  Backend listo." -ForegroundColor Green
    Write-Host "[5/5] Frontend iniciado." -ForegroundColor Yellow

    Start-Sleep -Seconds 3

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

function Show-Logs {
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Logs Disponibles (Lectura en Vivo)"  -ForegroundColor Blue
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Backend Log"  -ForegroundColor Green
    Write-Host "  [2] Frontend Log"  -ForegroundColor Green
    Write-Host "  [3] Volver"  -ForegroundColor Yellow
    Write-Host ""

    $choice = Read-Host "Selecciona una opción"

    switch ($choice) {
        '1' {
            Write-Host "Mostrando últimas 30 líneas del Backend (Ctrl+C para volver):" -ForegroundColor Cyan
            if (Test-Path $script:backendLog) {
                # -Wait permite leer el log en tiempo real como un 'tail -f' de Linux
                Get-Content $script:backendLog -Tail 30 -Wait
            } else {
                Write-Host "Log vacío o no existe." -ForegroundColor Red
                Read-Host "Presiona Enter para continuar..."
            }
        }
        '2' {
            Write-Host "Mostrando últimas 30 líneas del Frontend (Ctrl+C para volver):" -ForegroundColor Cyan
            if (Test-Path $script:frontendLog) {
                Get-Content $script:frontendLog -Tail 30 -Wait
            } else {
                Write-Host "Log vacío o no existe." -ForegroundColor Red
                Read-Host "Presiona Enter para continuar..."
            }
        }
        '3' { return }
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
            Write-Host "Iniciando mantenimiento profundo..." -ForegroundColor Cyan
            Stop-ProjectProcesses | Out-Null
            Remove-VenvSafely (Join-Path $script:backendPath "venv")
            if (Test-Path $script:nodeModules) { Remove-Item -Recurse -Force $script:nodeModules }
            Write-Host "Limpieza completada. Inicia de nuevo para reinstalar todo." -ForegroundColor Green
            Read-Host "Presiona Enter para continuar..."
        }
        '5' {
            Write-Host "Cerrando aplicativo de forma segura..." -ForegroundColor Yellow
            Stop-ProjectProcesses | Out-Null
            exit
        }
    }
}