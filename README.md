# 🏛️ TABULA RASA: Infraestructura de Soberanía Financiera Agentizada

**Tabula Rasa** es un ecosistema financiero de **Grado Industrial** diseñado bajo el paradigma de **Local-First AI**. No es una simple aplicación de rastreo de gastos; es un cerebro financiero privado que reside íntegramente en tu hardware, eliminando la dependencia de nubes externas y garantizando la privacidad absoluta de tu patrimonio.

---

## 🏗️ 1. Arquitectura y Visión de Ingeniería

El sistema ha sido construido con una obsesión por la **Integridad Matemática** y la **Disponibilidad Offline**.

### 🧬 El Stack Tecnológico
*   **Backend (Cerebro Lógico)**: Desarrollado en **FastAPI (Python 3.12)**. Elegido por su capacidad de procesamiento asíncrono y validación de datos estricta mediante Pydantic.
*   **Persistencia (Búnker de Datos)**: **SQLite en modo WAL (Write-Ahead Logging)**. Esto permite lecturas y escrituras simultáneas sin bloqueos, ofreciendo la robustez de una base de datos relacional con la velocidad de un sistema local.
*   **Frontend (Centro de Control)**: **React 19** impulsado por **Vite**. La interfaz utiliza **Glassmorphism**, una estética premium que utiliza transparencias y desenfoques (blur) para una experiencia visual de alta gama.
*   **Motor de Inteligencia**: Integración nativa con **Gemini 3.1 Flash-Lite** mediante un motor de orquestación de herramientas (Function Calling).

### 📐 Principios Arquitectónicos
1.  **Soberanía de Datos**: Tus balances, transacciones y secretos financieros NUNCA salen de tu máquina. La IA solo recibe datos anonimizados para razonamiento semántico.
2.  **Integridad en Centavos**: Todos los cálculos internos se realizan en **enteros (centavos)** para eliminar los errores de redondeo inherentes a los tipos de datos decimales en computación. Solo se convierten a dólares al mostrarse al usuario.
3.  **Idempotencia Criptográfica**: Cada importación de datos genera hashes únicos para las transacciones, asegurando que nunca existan registros duplicados, incluso si subes el mismo archivo múltiples veces.

---

## 🧠 2. Ecosistema de Inteligencia Agentizada

La inteligencia en Tabula Rasa no es un accesorio; es la columna vertebral del sistema. Se compone de un orquestador central que coordina múltiples capacidades.

### 🎭 Personalidades de IA (Análisis Psicofinanciero)
El sistema cuenta con un selector de personalidades que cambia el motor de razonamiento y el estilo de entrega de consejos:

*   **🕵️ Analista Senior (Forense Financiero)**: 
    *   *Propósito*: Auditoría profunda y detección de anomalías.
    *   *Comportamiento*: Trata tus estados de cuenta como una escena del crimen. Busca discrepancias entre tu presupuesto y tu realidad, identificando "gastos sospechosos" y patrones de fuga de capital.
*   **🔥 Modo Roast (Comedia Negra)**: 
    *   *Propósito*: Disciplina financiera a través del humor.
    *   *Comportamiento*: Brutalmente honesto y sarcástico. Utiliza tus propios datos para ridiculizar gastos innecesarios, creando un impacto psicológico que te hace pensar dos veces antes de gastar en cosas triviales.
*   **🎮 RPG Master (Game Master)**: 
    *   *Propósito*: Gamificación de la economía personal.
    *   *Comportamiento*: Transforma tu saldo en "Puntos de Vida" (HP). Tus metas son "Misiones Épicas" y tus gastos son "Debuffs" o ataques de monstruos. Ideal para quienes ven la vida como un juego de estrategia.
*   **⚡ Motivador Personal (Coach de Élite)**: 
    *   *Propósito*: Optimización del rendimiento financiero.
    *   *Comportamiento*: Enérgico y exigente. Enfocado en el crecimiento de tu patrimonio. Te empuja a ahorrar más y a ver cada dólar como un soldado en tu ejército financiero.
*   **🧘 Maestro Zen (Sabio Milenario)**: 
    *   *Propósito*: Conciencia y paz financiera.
    *   *Comportamiento*: Poético y profundo. Ve el dinero como energía fluida. Te ayuda a encontrar el equilibrio entre el disfrute del presente y la seguridad del futuro sin estrés.
*   **📊 Analista Profesional**: 
    *   *Propósito*: Eficiencia operativa pura.
    *   *Comportamiento*: Tono ejecutivo, sobrio y preciso. Cero relleno, 100% datos accionables y proyecciones estratégicas.

### 🛠️ Arsenal de Tools (Function Calling)
La IA tiene "manos" técnicas para operar sobre tu base de datos mediante **22 herramientas de consulta**:
| Herramienta | Función Técnica | Propósito de Usuario |
| :--- | :--- | :--- |
| `get_safe_to_spend` | Cálculo de liquidez proyectada | Saber cuánto puedo gastar hoy sin arruinar el mes. |
| `get_audit_report` | Escaneo de integridad de datos | Saber si tengo duplicados o transacciones sin categorizar. |
| `get_fiscal_summary` | Agregación de impuestos SRI | Proyectar cuánto debo pagar de IVA o Retenciones. |
| `get_projection` | Simulación Monte Carlo simple | Ver mi saldo proyectado a 30, 60 y 90 días. |
| `get_net_worth_history` | Análisis de tendencia de patrimonio | Ver si soy más rico hoy que hace 6 meses. |
| `get_active_goals` | Auditoría de progreso de metas | ¿Cuándo voy a completar mi meta del auto? |
| `search_categories` | Resolución semántica de IDs | Encontrar categorías sin conocer su código interno. |
| `get_monthly_summary` | Consolidación histórica | Comparar mi desempeño actual con meses pasados. |

### 🛡️ Blindaje de Seguridad y Prompting
El sistema utiliza una capa de **Instrucciones de Sistema (System Prompts)** de alto nivel:
*   **Read-Only Strict**: La IA tiene acceso a las herramientas de consulta, pero las funciones de escritura están físicamente desconectadas de su motor de razonamiento.
*   **Cero Alucinación Numérica**: Se le prohíbe a la IA hacer aritmética manual. Si necesita sumar, debe llamar a una herramienta que devuelva el resultado matemático exacto desde el backend.
*   **Contexto de Tiempo Real**: Cada prompt incluye el día, fecha, hora y zona horaria exacta (America/Guayaquil) para que el análisis de vencimientos de deudas sea perfecto.

---

## 🗺️ 3. Topografía del Sistema (Rayos X de Módulos)

### 📈 Panel Principal (Dashboard)
Es el corazón visual. Muestra la métrica estrella: **Safe-to-Spend**.
*   **Características**: Gráficas de flujo de caja en tiempo real, Sankey diagram de ingresos vs egresos, y panel de Sentinel.
*   **Tip**: Mira el color del indicador de liquidez; si está en verde esmeralda, tu proyección a 30 días es positiva.

### 💸 Transacciones y Módulo Fiscal SRI
Gestión avanzada de registros y cumplimiento tributario ecuatoriano.
*   **SRI Compliance**: Generador nativo de anexos. Clasifica por palabras clave y códigos oficiales (3290 Salud, 3300 Alimentación, etc.).
*   **Exportación**: Permite descargar archivos **XML y JSON** listos para subir al portal del SRI.
*   **Nota**: Usa la función de "Marcar como Interna" para transferencias entre tus propias cuentas; así no ensucias tus estadísticas de gasto real.

### 💳 Cuentas y Tarjetas de Crédito
Control total de tus instrumentos financieros.
*   **Diferenciación**: Separa saldos líquidos de líneas de crédito.
*   **Deuda Neta**: Calcula automáticamente tu posición real restando tus consumos de tarjeta de tus saldos en efectivo.

### 🎯 Metas y Presupuestos
Ingeniería de futuro.
*   **Presupuestos**: Control por categoría con alertas visuales de "sobregasto".
*   **Metas**: Algoritmo de proyección que te dice la fecha estimada de cumplimiento basado en tu capacidad de ahorro real actual.

### 🕰️ Recordatorios y Suscripciones
Automatización de pagos fijos.
*   **Inteligencia**: Las suscripciones se descuentan automáticamente de tu "Safe-to-Spend" proyectado para que nunca gastes dinero que ya está comprometido para el Netflix o la renta.

### 📸 Snapshots de Patrimonio
Cortes mensuales de tu salud financiera total.
*   **Depreciación Automática**: Los activos como vehículos o tecnología pierden valor contable automáticamente mes a mes, dándote un valor de patrimonio neto real y no inflado.

---

## 🚀 4. Orquestación Automática (Zero-Friction Setup)

Tabula Rasa incluye un script de orquestación industrial (`menu.ps1`) que maneja todo el ciclo de vida del software:

### 🛠️ Capacidades del Orquestador
1.  **Auto-Provisioning**: Si no tienes **Python 3.12** o **Node.js**, el script los descarga e instala usando **Winget** (Windows Package Manager). No necesitas navegar por sitios web de descarga.
2.  **Self-Healing (Auto-Curación)**: En cada arranque, el sistema verifica la salud de las dependencias. Si detecta una librería corrupta, recrea el entorno virtual en segundos.
3.  **Motor `uv`**: Implementa el instalador `uv` para Python, permitiendo que la instalación de requerimientos sea hasta 100 veces más rápida que el `pip` tradicional.
4.  **Gestión de Procesos Zombie**: Detecta si hubo un cierre inesperado y libera automáticamente los puertos 8001 y 5173 para evitar errores de "Address already in use".

---

## 🛠️ 5. Guía de Inicio Rápido (Para Humanos e IAs)

### Requisitos Mínimos
*   Sistema Operativo: Windows 10/11 (Optimizado para PowerShell).
*   Memoria: 4GB RAM mínimo.
*   Conexión: Solo necesaria para la API de Gemini (los datos permanecen locales).

### Instalación en 1 Paso
1.  Ejecuta el archivo `iniciar.bat` (o corre `.\menu.ps1` en PowerShell).
2.  El script se encargará de instalar Python, Node, crear el venv, instalar dependencias y abrir el navegador.

### Tip para Desarrolladores
Revisa el archivo `HISTORIAL.md` para ver la evolución de las versiones y las decisiones arquitectónicas tomadas en cada sprint.

---
*Desarrollado con una visión de libertad, privacidad y precisión absoluta.* 🏛️✨
