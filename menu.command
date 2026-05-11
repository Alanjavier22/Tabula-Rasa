#!/bin/bash

# TABULA RASA - macOS/Linux Control Center (.command version)
# ----------------------------------------------------------

# Asegurar que el script se ejecute en su propia carpeta
cd "$(dirname "$0")"

# Colores ANSI
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(pwd)"
BACKEND_PATH="$SCRIPT_DIR/backend"
FRONTEND_PATH="$SCRIPT_DIR/frontend"
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"
VENV_PYTHON="$BACKEND_PATH/venv/bin/python"
NODE_MODULES="$FRONTEND_PATH/node_modules"

# 1. Validación de Homebrew (El Winget de Mac)
check_brew() {
    if ! command -v brew &> /dev/null; then
        echo -e "${YELLOW}⚠️  Homebrew no detectado (necesario para instalar dependencias).${NC}"
        read -p "¿Deseas instalar Homebrew ahora? (s/n): " confirm
        if [[ $confirm == [sS] ]]; then
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        else
            echo -e "${RED}❌ No se puede continuar sin Homebrew.${NC}"
            exit 1
        fi
    fi
}

# 2. Validación de Python 3.12+
check_python() {
    if ! command -v python3 &> /dev/null; then
        echo -e "${YELLOW}⚠️  Python 3 no detectado.${NC}"
        check_brew
        read -p "¿Deseas instalar Python 3.12 vía Homebrew? (s/n): " confirm
        if [[ $confirm == [sS] ]]; then
            brew install python@3.12
        else
            exit 1
        fi
    fi
}

# 3. Validación de Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}⚠️  Node.js no detectado.${NC}"
        check_brew
        read -p "¿Deseas instalar Node.js vía Homebrew? (s/n): " confirm
        if [[ $confirm == [sS] ]]; then
            brew install node
        else
            exit 1
        fi
    fi
}

show_header() {
    echo -e "${MAGENTA}  ____________________________________________${NC}"
    echo -e "${MAGENTA}  |                                          |${NC}"
    echo -e "${CYAN}  |   TABULA RASA - Financial Control v2.0   |${NC}"
    echo -e "${MAGENTA}  |__________________________________________|${NC}"
}

stop_services() {
    echo -e "${YELLOW}⏹️  Deteniendo servicios en puertos 8001 y 5173...${NC}"
    lsof -ti:8001 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}✅ Puertos liberados.${NC}"
    sleep 1
}

start_app() {
    stop_services
    
    # Backend Setup
    if [ ! -f "$VENV_PYTHON" ]; then
        echo -e "${CYAN}📦 Creando entorno virtual Python...${NC}"
        python3 -m venv "$BACKEND_PATH/venv"
        "$VENV_PYTHON" -m pip install uv
        "$VENV_PYTHON" -m uv pip install -r "$BACKEND_PATH/requirements.txt"
    fi

    echo -e "${CYAN}🚀 Iniciando Backend...${NC}"
    nohup "$VENV_PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8001 > "$BACKEND_LOG" 2>&1 &
    
    # Frontend Setup
    if [ ! -d "$NODE_MODULES" ]; then
        echo -e "${CYAN}📦 Instalando dependencias de Node...${NC}"
        cd "$FRONTEND_PATH" && npm install && cd "$SCRIPT_DIR"
    fi

    echo -e "${CYAN}🚀 Iniciando Frontend...${NC}"
    cd "$FRONTEND_PATH" && nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    
    echo -e "${GREEN}✅ Aplicativo iniciado!${NC}"
    echo -e "${BLUE}Backend: http://localhost:8001${NC}"
    echo -e "${BLUE}Frontend: http://localhost:5173${NC}"
    
    sleep 2
    open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null
}

show_logs() {
    echo -e "${BLUE}Selecciona Log:${NC}"
    echo "1) Backend"
    echo "2) Frontend"
    read -p "Opción: " log_choice
    if [ "$log_choice" == "1" ]; then
        tail -f "$BACKEND_LOG"
    else
        tail -f "$FRONTEND_LOG"
    fi
}

# Inicialización
check_python
check_node

while true; do
    clear
    show_header
    echo -e "\n  ${GREEN}[1] INICIAR APLICATIVO${NC}"
    echo -e "  ${YELLOW}[2] DETENER SERVICIOS${NC}"
    echo -e "  ${BLUE}[3] VER LOGS${NC}"
    echo -e "  ${RED}[4] SALIR${NC}"
    
    # Estado
    if lsof -Pi :8001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "\n  Estado: ${GREEN}>>> ONLINE <<<${NC}"
    else
        echo -e "\n  Estado: ${RED}>>> OFFLINE <<<${NC}"
    fi
    echo -e "  --------------------------------------------"
    
    read -p "  Selecciona una opción: " choice
    
    case $choice in
        1) start_app ;;
        2) stop_services ;;
        3) show_logs ;;
        4) stop_services; exit 0 ;;
    esac
done
