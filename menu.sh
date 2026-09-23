#!/bin/bash
set -Eeuo pipefail

# TABULA RASA - macOS/Linux Control Center
# ----------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
BACKEND_PATH="$SCRIPT_DIR/backend"
FRONTEND_PATH="$SCRIPT_DIR/frontend"
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"
VENV_PYTHON="$BACKEND_PATH/venv/bin/python"
NODE_MODULES="$FRONTEND_PATH/node_modules"
RUN_DIR="$SCRIPT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
UVICORN_HOST="${UVICORN_HOST:-127.0.0.1}"
PYTHON_BIN=""
NODE_BIN=""

mkdir -p "$RUN_DIR"

print_error() {
    echo -e "$RED❌ $*$NC" >&2
}

check_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        print_error "No se encontró el comando requerido: $1"
        return 1
    fi
}

check_brew() {
    if ! command -v brew >/dev/null 2>&1; then
        echo -e "$YELLOW⚠️  Homebrew no detectado (necesario para instalar dependencias).$NC"
        read -r -p "¿Deseas instalar Homebrew ahora? (s/n): " confirm
        if [[ $confirm == [sS] ]]; then
            check_command curl || return 1
            if ! curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | /bin/bash; then
                print_error "La instalación de Homebrew falló."
                return 1
            fi
            if [[ -x "/opt/homebrew/bin/brew" ]]; then
                PATH="/opt/homebrew/bin:$PATH"
                export PATH
            elif [[ -x "/usr/local/bin/brew" ]]; then
                PATH="/usr/local/bin:$PATH"
                export PATH
            fi
            if ! command -v brew >/dev/null 2>&1; then
                print_error "Homebrew se instaló, pero no quedó disponible en el PATH actual."
                return 1
            fi
        else
            print_error "No se puede continuar sin Homebrew."
            return 1
        fi
    fi
}

check_python() {
    PYTHON_BIN="$(command -v python3 || true)"
    if [[ -n "$PYTHON_BIN" ]] && "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1; then
        echo -e "$GREEN✅ Python 3.12+ detectado.$NC"
        return 0
    fi

    echo -e "$YELLOW⚠️  Python 3.12+ no detectado.$NC"
    check_brew || return 1
    read -r -p "¿Deseas instalar Python 3.12 vía Homebrew? (s/n): " confirm
    if [[ $confirm == [sS] ]]; then
        if ! brew install python@3.12; then
            print_error "No se pudo instalar Python 3.12 vía Homebrew."
            return 1
        fi
        local brew_python
        brew_python="$(brew --prefix python@3.12 2>/dev/null || true)/bin/python3.12"
        if [[ -x "$brew_python" ]]; then
            PYTHON_BIN="$brew_python"
        else
            PYTHON_BIN="$(command -v python3 || true)"
        fi
        if [[ -z "$PYTHON_BIN" ]] || ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1; then
            print_error "Python 3.12+ sigue sin estar disponible en esta sesión."
            return 1
        fi
    else
        print_error "No se puede continuar sin Python 3.12+."
        return 1
    fi
}

check_node() {
    NODE_BIN="$(command -v node || true)"
    if [[ -n "$NODE_BIN" ]] && "$NODE_BIN" -e 'const [a,b,c] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && (b > 19 || (b === 19 && c >= 0))) ? 0 : 1)' >/dev/null 2>&1; then
        echo -e "$GREEN✅ Node.js 20.19+ detectado.$NC"
        return 0
    fi

    echo -e "$YELLOW⚠️  Node.js 20.19+ no detectado.$NC"
    check_brew || return 1
    read -r -p "¿Deseas instalar Node.js vía Homebrew? (s/n): " confirm
    if [[ $confirm == [sS] ]]; then
        if ! brew install node; then
            print_error "No se pudo instalar Node.js vía Homebrew."
            return 1
        fi
        NODE_BIN="$(command -v node || true)"
        if [[ -z "$NODE_BIN" ]] || ! "$NODE_BIN" -e 'const [a,b,c] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && (b > 19 || (b === 19 && c >= 0))) ? 0 : 1)' >/dev/null 2>&1; then
            print_error "Node.js 20.19+ sigue sin estar disponible en esta sesión."
            return 1
        fi
    else
        print_error "No se puede continuar sin Node.js 20.19+."
        return 1
    fi
}

get_process_cwd() {
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
}

is_project_process() {
    local pid="$1"
    local expected_dir="$2"
    local command_pattern="$3"
    local cwd command

    kill -0 "$pid" 2>/dev/null || return 1
    cwd="$(get_process_cwd "$pid" || true)"
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    [[ "$cwd" == "$expected_dir" ]] || return 1
    [[ "$command" =~ $command_pattern ]]
}

stop_process_tree() {
    local pid="$1"
    local children child
    children="$(pgrep -P "$pid" 2>/dev/null || true)"
    for child in $children; do
        stop_process_tree "$child"
    done

    kill "$pid" 2>/dev/null || true
    for _ in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        sleep 0.2
    done
    kill -9 "$pid" 2>/dev/null || true
}

stop_pid_file() {
    local pid_file="$1"
    local expected_dir="$2"
    local command_pattern="$3"
    local pid=""

    if [[ -f "$pid_file" ]]; then
        read -r pid < "$pid_file" || true
        if [[ "$pid" =~ ^[0-9]+$ ]] && is_project_process "$pid" "$expected_dir" "$command_pattern"; then
            echo -e "$YELLOW⏹️  Deteniendo PID $pid del proyecto...$NC"
            stop_process_tree "$pid"
        elif [[ -n "$pid" ]]; then
            echo -e "$YELLOW⚠️  PID registrado ($pid) ya no pertenece al proyecto; no se tocará.$NC"
        fi
        rm -f -- "$pid_file"
    fi
}

stop_project_listeners() {
    local port="$1"
    local expected_dir="$2"
    local command_pattern="$3"
    local pids pid

    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    for pid in $pids; do
        if is_project_process "$pid" "$expected_dir" "$command_pattern"; then
            echo -e "$YELLOW⏹️  Deteniendo proceso del proyecto en el puerto $port (PID $pid)...$NC"
            stop_process_tree "$pid"
        else
            echo -e "$YELLOW⚠️  El puerto $port está ocupado por un proceso ajeno; no se detendrá.$NC"
        fi
    done
}

stop_services() {
    echo -e "$YELLOW⏹️  Deteniendo servicios propios en puertos 8001 y 5173...$NC"
    stop_pid_file "$BACKEND_PID_FILE" "$BACKEND_PATH" 'uvicorn|python'
    stop_pid_file "$FRONTEND_PID_FILE" "$FRONTEND_PATH" 'npm|node|vite'
    stop_project_listeners 8001 "$BACKEND_PATH" 'uvicorn|python'
    stop_project_listeners 5173 "$FRONTEND_PATH" 'npm|node|vite'
    echo -e "$GREEN✅ Procesos propios gestionados; los procesos ajenos no fueron tocados.$NC"
    sleep 1
}

install_backend_dependencies() {
    echo -e "$CYAN📦 Instalando dependencias Python...$NC"
    if ! "$VENV_PYTHON" -m pip install --disable-pip-version-check uv; then
        print_error "No se pudo instalar uv en el entorno virtual."
        return 1
    fi
    if ! "$VENV_PYTHON" -m uv pip install -r "$BACKEND_PATH/requirements.txt"; then
        print_error "No se pudieron instalar las dependencias de backend."
        return 1
    fi
    "$VENV_PYTHON" -c 'import fastapi, sqlalchemy, pydantic, cryptography, jwt'
}

ensure_backend() {
    if [[ ! -x "$VENV_PYTHON" ]]; then
        echo -e "$CYAN📦 Creando entorno virtual Python...$NC"
        if ! "$PYTHON_BIN" -m venv "$BACKEND_PATH/venv"; then
            print_error "No se pudo crear el entorno virtual."
            return 1
        fi
        install_backend_dependencies || return 1
    elif ! (cd "$BACKEND_PATH" && "$VENV_PYTHON" -c 'import fastapi, sqlalchemy, pydantic, cryptography, jwt'); then
        echo -e "$YELLOW⚠️  El entorno virtual no tiene todas las dependencias. Reparando...$NC"
        install_backend_dependencies || return 1
    fi

    if ! (cd "$BACKEND_PATH" && "$VENV_PYTHON" -c 'from main import app'); then
        print_error "La aplicación backend no se puede importar."
        return 1
    fi
}

wait_for_url() {
    local url="$1"
    local attempts="$2"
    local i

    check_command curl || return 1
    for ((i=1; i<=attempts; i++)); do
        if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

start_app() {
    stop_services
    ensure_backend || return 1

    echo -e "$CYAN🚀 Iniciando Backend en $UVICORN_HOST...$NC"
    (
        cd "$BACKEND_PATH"
        exec nohup "$VENV_PYTHON" -m uvicorn main:app --host "$UVICORN_HOST" --port 8001
    ) > "$BACKEND_LOG" 2>&1 &
    local backend_pid=$!
    echo "$backend_pid" > "$BACKEND_PID_FILE"

    echo -e "$YELLOW⏳ Esperando health check del backend...$NC"
    if ! wait_for_url "http://127.0.0.1:8001/health" 15; then
        print_error "El backend no respondió en 15 segundos."
        tail -n 40 "$BACKEND_LOG" 2>/dev/null || true
        stop_pid_file "$BACKEND_PID_FILE" "$BACKEND_PATH" 'uvicorn|python'
        return 1
    fi

    if [[ ! -d "$NODE_MODULES" ]]; then
        echo -e "$CYAN📦 Instalando dependencias de Node...$NC"
        local npm_install_command="install"
        if [[ -f "$FRONTEND_PATH/package-lock.json" ]]; then
            npm_install_command="ci"
        fi
        if ! (cd "$FRONTEND_PATH" && npm "$npm_install_command"); then
            print_error "Falló npm $npm_install_command."
            stop_pid_file "$BACKEND_PID_FILE" "$BACKEND_PATH" 'uvicorn|python'
            return 1
        fi
    fi

    echo -e "$CYAN🚀 Iniciando Frontend...$NC"
    (
        cd "$FRONTEND_PATH"
        exec nohup npm run dev -- --host 127.0.0.1
    ) > "$FRONTEND_LOG" 2>&1 &
    local frontend_pid=$!
    echo "$frontend_pid" > "$FRONTEND_PID_FILE"

    echo -e "$YELLOW⏳ Esperando health check del frontend...$NC"
    if ! wait_for_url "http://127.0.0.1:5173" 15; then
        print_error "El frontend no respondió en 15 segundos."
        tail -n 40 "$FRONTEND_LOG" 2>/dev/null || true
        stop_services
        return 1
    fi

    echo -e "$GREEN✅ Aplicativo iniciado correctamente.$NC"
    echo -e "$BLUE Backend: http://127.0.0.1:8001$NC"
    echo -e "$BLUE Frontend: http://127.0.0.1:5173$NC"

    if command -v open >/dev/null 2>&1; then
        open "http://127.0.0.1:5173" 2>/dev/null || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://127.0.0.1:5173" 2>/dev/null || true
    fi
}

show_logs() {
    echo -e "$BLUESelecciona Log:$NC"
    echo "1) Backend"
    echo "2) Frontend"
    read -r -p "Opción: " log_choice
    case "$log_choice" in
        1) [[ -f "$BACKEND_LOG" ]] && tail -f "$BACKEND_LOG" || print_error "El log del backend aún no existe." ;;
        2) [[ -f "$FRONTEND_LOG" ]] && tail -f "$FRONTEND_LOG" || print_error "El log del frontend aún no existe." ;;
        *) echo -e "$YELLOW Opción inválida.$NC" ;;
    esac
}

check_command lsof
check_command ps
check_command pgrep
check_command curl
check_python
check_node
check_command npm

while true; do
    clear 2>/dev/null || true
    echo -e "$MAGENTA  ____________________________________________$NC"
    echo -e "$MAGENTA  |                                          |$NC"
    echo -e "$CYAN  |   TABULA RASA - Financial Control v2.0   |$NC"
    echo -e "$MAGENTA  |__________________________________________|$NC"
    echo -e "\n  $GREEN[1] INICIAR APLICATIVO$NC"
    echo -e "  $YELLOW[2] DETENER SERVICIOS$NC"
    echo -e "  $BLUE[3] VER LOGS$NC"
    echo -e "  $RED[4] SALIR$NC"

    backend_online=false
    frontend_online=false
    if lsof -Pi :8001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        backend_online=true
    fi
    if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
        frontend_online=true
    fi
    if [[ "$backend_online" == true && "$frontend_online" == true ]]; then
        echo -e "\n  Estado: $GREEN>>> ONLINE <<<$NC"
    elif [[ "$backend_online" == true ]]; then
        echo -e "\n  Estado: $YELLOW>>> BACKEND ONLINE / FRONTEND OFFLINE <<<$NC"
    elif [[ "$frontend_online" == true ]]; then
        echo -e "\n  Estado: $YELLOW>>> BACKEND OFFLINE / FRONTEND ONLINE <<<$NC"
    else
        echo -e "\n  Estado: $RED>>> OFFLINE <<<$NC"
    fi
    echo -e "  --------------------------------------------"

    if ! read -r -p "  Selecciona una opción: " choice; then
        stop_services
        exit 0
    fi

    case "$choice" in
        1) start_app || read -r -p "Presiona Enter para continuar..." ;;
        2) stop_services ;;
        3) show_logs ;;
        4) stop_services; exit 0 ;;
        *) echo -e "$YELLOW Opción inválida.$NC"; sleep 1 ;;
    esac
done
