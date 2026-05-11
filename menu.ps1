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
$script:venvPython = Join-Path $script:backendPath "venv\Scripts\python.exe"
$script:nodeModules = Join-Path $script:frontendPath "node_modules"

# Función para instalar requisitos vía Winget
function Install-Requirement {
    param(
        [string]$Name,
        [string]$Id
    )
    
    Write-Host "⚠️  $Name no detectado." -ForegroundColor Yellow
    $confirm = Read-Host "¿Deseas que lo instale automáticamente por ti? (S/N)"
    if ($confirm -eq 'S' -or $confirm -eq 's') {
        Write-Host "🚀 Iniciando instalación de $Name..." -ForegroundColor Cyan
        winget install --id $Id --source winget --accept-package-agreements --accept-source-agreements
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $Name instalado correctamente." -ForegroundColor Green
            Write-Host "📢 IMPORTANTE: Es posible que debas cerrar y volver a abrir este menú para que los cambios surtan efecto." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
            return $true
        } else {
            Write-Host "❌ Error al instalar $Name. Por favor, instálalo manualmente desde su web oficial." -ForegroundColor Red
            Read-Host "Presiona Enter para salir..."
            exit 1
        }
    } else {
        Write-Host "❌ No se puede continuar sin $Name." -ForegroundColor Red
        exit 1
    }
}

# Validación de versión de Python (requerido: 3.12+)
function Test-PythonVersion {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        if (Install-Requirement "Python 3.12" "Python.Python.3.12") {
            # Intentamos refrescar el PATH para la sesión actual
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
    }
    
    # Volvemos a probar después de la posible instalación
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Python aún no es reconocido. Por favor, reinicia la terminal." -ForegroundColor Red
        exit 1
    }

    $versionStr = $pythonVersion -replace "Python ", ""
    try {
        $version = [version]$versionStr
        $minVersion = [version]"3.12.0"
        if ($version -lt $minVersion) {
            Write-Host "⚠️  Versión de Python antigua ($versionStr). Se recomienda 3.12+." -ForegroundColor Yellow
        } else {
            Write-Host "✅ Python $versionStr detectado" -ForegroundColor Green
        }
    } catch {
        Write-Host "✅ Python detectado" -ForegroundColor Green
    }
}

function Test-NodeVersion {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        if (Install-Requirement "Node.js" "OpenJS.NodeJS") {
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        }
    }
    
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Node.js aún no es reconocido. Por favor, reinicia la terminal." -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Node.js $nodeVersion detectado" -ForegroundColor Green
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
    Write-Host "  Limpiando agresivamente procesos Python y Node..." -ForegroundColor Yellow
    $killedSomething = $false

    # Matar todos los procesos Python
    $pythonProcesses = Get-Process -Name "python*" -ErrorAction SilentlyContinue
    if ($pythonProcesses) {
        foreach ($proc in $pythonProcesses) {
            try {
                Stop-Process -Id $proc.Id -Force
                Write-Host "  Proceso $($proc.ProcessName) (PID: $($proc.Id)) detenido." -ForegroundColor Green
                $killedSomething = $true
            } catch {
                Write-Host "  Error al detener $($proc.ProcessName): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }

    # Matar todos los procesos Node
    $nodeProcesses = Get-Process -Name "node*" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        foreach ($proc in $nodeProcesses) {
            try {
                Stop-Process -Id $proc.Id -Force
                Write-Host "  Proceso $($proc.ProcessName) (PID: $($proc.Id)) detenido." -ForegroundColor Green
                $killedSomething = $true
            } catch {
                Write-Host "  Error al detener $($proc.ProcessName): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }

    if (-not $killedSomething) {
        Write-Host "  No se encontraron procesos Python o Node activos." -ForegroundColor Gray
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
    Start-Sleep -Seconds 1

    # 2. Rotación de Logs (Limpieza en frío)
    Write-Host "[2/5] Limpiando archivos de log anteriores..." -ForegroundColor Yellow
    Clear-Content $script:backendLog -ErrorAction SilentlyContinue
    Clear-Content $script:frontendLog -ErrorAction SilentlyContinue

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
        Write-Host "  Creando entorno virtual e instalando dependencias (Ultra-rápido con uv)..." -ForegroundColor Magenta
        python -m venv $venvPath

        # 1. Instalar uv (toma 1 segundo)
        & $script:venvPython -m pip install uv --quiet

        # 2. Usar uv para instalar el requirements (10x - 100x más rápido)
        & $script:venvPython -m uv pip install -r (Join-Path $script:backendPath "requirements.txt")

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Falló la instalación de dependencias con uv. Revisa requirements.txt" -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }
    }

    # 4. Iniciar Backend
    Write-Host "[4/5] Iniciando Backend..."  -ForegroundColor Yellow
    
    # Inicia como proceso oculto, enrutando StdOut y StdErr al Log
    $backendErrorLog = Join-Path $script:scriptPath "backend_error.log"
    Start-Process -FilePath $script:venvPython -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8001" -WorkingDirectory $script:backendPath -WindowStyle Hidden -RedirectStandardOutput $script:backendLog -RedirectStandardError $backendErrorLog

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

    # 5. Frontend (Self-Healing + Start)
    Write-Host "[5/5] Preparando e Iniciando Frontend..."  -ForegroundColor Yellow
    if (-not (Test-Path $script:nodeModules)) {
        Write-Host "  Dependencias de Node no detectadas. Instalando..." -ForegroundColor Magenta
        Push-Location $script:frontendPath
        npm install
        Pop-Location
    }

    # Inicia Vite oculto enrutando logs
    $frontendErrorLog = Join-Path $script:scriptPath "frontend_error.log"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $script:frontendPath -WindowStyle Hidden -RedirectStandardOutput $script:frontendLog -RedirectStandardError $frontendErrorLog

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
            Stop-SpecificPorts | Out-Null
            Remove-VenvSafely (Join-Path $script:backendPath "venv")
            if (Test-Path $script:nodeModules) { Remove-Item -Recurse -Force $script:nodeModules }
            Write-Host "Limpieza completada. Inicia de nuevo para reinstalar todo." -ForegroundColor Green
            Read-Host "Presiona Enter para continuar..."
        }
        '5' {
            Write-Host "Cerrando aplicativo de forma segura..." -ForegroundColor Yellow
            Stop-SpecificPorts | Out-Null
            exit
        }
    }
}