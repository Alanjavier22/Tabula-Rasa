# Menú interactivo para Finanzas Personales (Versión Enterprise)

# Validación de versión de Python (requerido: 3.12+)
function Test-PythonVersion {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ERROR: Python no está instalado o no está en PATH." -ForegroundColor Red
        Write-Host "   Requisito: Python 3.12 o superior" -ForegroundColor Yellow
        exit 1
    }
    
    # Extract version number (e.g., "Python 3.12.0" -> "3.12.0")
    $versionStr = $pythonVersion -replace "Python ", ""
    $version = [version]$versionStr
    
    # Check if version is 3.12 or higher
    $minVersion = [version]"3.12.0"
    if ($version -lt $minVersion) {
        Write-Host "❌ ERROR: Versión de Python incompatible." -ForegroundColor Red
        Write-Host "   Versión actual: $versionStr" -ForegroundColor Yellow
        Write-Host "   Requisito mínimo: Python 3.12.0" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Por favor, actualiza Python desde: https://www.python.org/downloads/" -ForegroundColor Cyan
        exit 1
    }
    
    Write-Host "✅ Python $versionStr detectado (compatible)" -ForegroundColor Green
}

Test-PythonVersion

# Validación de privilegios de Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  ADVERTENCIA: El script no se está ejecutando como Administrador." -ForegroundColor Red
    Write-Host "   Algunas operaciones de limpieza de archivos podrían fallar por falta de permisos." -ForegroundColor Yellow
    Write-Host "   Se recomienda ejecutar PowerShell como Administrador." -ForegroundColor Yellow
    Write-Host ""
    Start-Sleep -Seconds 2
}

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $scriptPath "backend"
$frontendPath = Join-Path $scriptPath "frontend"
$backendLog = Join-Path $scriptPath "backend.log"
$frontendLog = Join-Path $scriptPath "frontend.log"

# Rutas críticas de Self-Healing
$venvPython = Join-Path $backendPath "venv\Scripts\python.exe"
$nodeModules = Join-Path $frontendPath "node_modules"

function Show-Menu {
    Clear-Host
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host "  Finanzas Personales - Menú Principal"  -ForegroundColor Cyan
    Write-Host "========================================"  -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Iniciar Aplicativo"  -ForegroundColor Green
    Write-Host "  [2] Detener Aplicativo"  -ForegroundColor Yellow
    Write-Host "  [3] Ver Logs"  -ForegroundColor Blue
    Write-Host "  [4] Salir"  -ForegroundColor Red
    Write-Host ""
    Write-Host "========================================"  -ForegroundColor Cyan
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

function Safe-RemoveVenv {
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
    Clear-Content $backendLog -ErrorAction SilentlyContinue
    Clear-Content $frontendLog -ErrorAction SilentlyContinue

    # 3. Backend Health Check & Self-Healing
    Write-Host "[3/5] Verificando salud del entorno virtual..."  -ForegroundColor Yellow
    $venvPath = Join-Path $backendPath "venv"
    $venvNeedsReinstall = $false

    if (Test-Path $venvPython) {
        # Check if critical packages and app can be imported
        & $venvPython -c "import fastapi, sqlalchemy, pydantic, cryptography" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Entorno virtual corrupto detectado. Reinstalando..." -ForegroundColor Magenta
            Safe-RemoveVenv $venvPath
            $venvNeedsReinstall = $true
        } else {
            # Try to import the main app module
            & $venvPython -c "import sys; sys.path.insert(0, '$backendPath'); from main import app" 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  Error al importar aplicación. Reinstalando..." -ForegroundColor Magenta
                Safe-RemoveVenv $venvPath
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
        & $venvPython -m pip install uv --quiet

        # 2. Usar uv para instalar el requirements (10x - 100x más rápido)
        & $venvPython -m uv pip install -r (Join-Path $backendPath "requirements.txt")

        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Falló la instalación de dependencias con uv. Revisa requirements.txt" -ForegroundColor Red
            Read-Host "Presiona Enter para continuar..."
            return
        }
    }

    # 4. Iniciar Backend
    Write-Host "[4/5] Iniciando Backend..."  -ForegroundColor Yellow
    
    # Inicia como proceso oculto, enrutando StdOut y StdErr al Log
    $backendErrorLog = Join-Path $scriptPath "backend_error.log"
    Start-Process -FilePath $venvPython -ArgumentList "-m uvicorn main:app --host 0.0.0.0 --port 8001" -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrorLog

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
    if (-not (Test-Path $nodeModules)) {
        Write-Host "  Dependencias de Node no detectadas. Instalando..." -ForegroundColor Magenta
        Push-Location $frontendPath
        npm install
        Pop-Location
    }

    # Inicia Vite oculto enrutando logs
    $frontendErrorLog = Join-Path $scriptPath "frontend_error.log"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrorLog

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
            if (Test-Path $backendLog) {
                # -Wait permite leer el log en tiempo real como un 'tail -f' de Linux
                Get-Content $backendLog -Tail 30 -Wait
            } else {
                Write-Host "Log vacío o no existe." -ForegroundColor Red
                Read-Host "Presiona Enter para continuar..."
            }
        }
        '2' {
            Write-Host "Mostrando últimas 30 líneas del Frontend (Ctrl+C para volver):" -ForegroundColor Cyan
            if (Test-Path $frontendLog) {
                Get-Content $frontendLog -Tail 30 -Wait
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
            Write-Host "Cerrando aplicativo de forma segura..." -ForegroundColor Yellow
            Stop-SpecificPorts | Out-Null
            exit
        }
    }
}