# 🏛️ Tabula Rasa - Ecosistema Financiero Agentizado

**Tabula Rasa** no es solo un gestor de finanzas; es una infraestructura de **Inteligencia Financiera Local-First** de grado industrial. Diseñada para ofrecer privacidad absoluta mediante ejecución local, combinada con el poder de razonamiento de modelos de lenguaje de última generación (Gemini 3.1 Flash-Lite).

---

## 🏗️ Visión Arquitectónica (Grado Industrial)

El sistema opera bajo un paradigma de **Soberanía de Datos**. A diferencia de las apps tradicionales de SaaS, Tabula Rasa vive en tu máquina, procesa tus datos en tu máquina y solo consulta a la IA para razonamiento semántico, nunca para almacenamiento.

*   **Core Engine**: FastAPI (Python 3.12+) con persistencia en **SQLite (WAL Mode)** para concurrencia segura.
*   **Frontend UI**: React 19 + Vite + Tailwind CSS, enfocado en una experiencia **Glassmorphism** de alta fidelidad.
*   **Capa de Integridad**: Motor de cálculo en `Decimal` para evitar errores de coma flotante, con transacciones atómicas que garantizan que ni un solo centavo se pierda en colisiones de datos.
*   **Ecosistema AI**: Orquestación agentizada mediante **Function Calling**, permitiendo que la IA sea un auditor en tiempo real de tu base de datos local.

---

## 🧠 Ecosistema de Inteligencia Agentizada

La inteligencia de Tabula Rasa no es un chatbot pegado; es un **cerebro integrado** que posee "ojos" (Vision API) y "manos" (Tools) para entender tu realidad financiera.

### 🎭 Las 6 Personalidades del Cerebro AI
El sistema adapta su razonamiento y lenguaje según la faceta que necesites consultar:

1.  **🕵️‍♂️ Forense Financiero (Analista Senior)**: Su enfoque es la detección de anomalías. Trata tus estados de cuenta como una escena del crimen, buscando "gastos hormiga" (cómplices) y fallos de planificación (autores intelectuales).
2.  **🔥 Modo Roast (Comedia Negra)**: Crítica constructiva pero brutalmente humillante. Usa humor negro y analogías absurdas para destruir tus malos hábitos financieros. Si gastas $200 en café, prepárate para ser ridiculizado con estilo.
3.  **🎮 RPG Master (Game Master)**: Transforma tus finanzas en un juego de rol épico. Tu saldo es tu barra de vida (HP), los gastos son "debuffs" y el ahorro es "farmeo de oro". Una experiencia inmersiva para los amantes de los videojuegos.
4.  **⚡ Motivador Personal (Coach de Élite)**: Trata tus finanzas como un deporte de alto rendimiento. Enérgico, exigente e inspirador. Termina cada consulta con un "ejercicio del día" para fortalecer tu músculo financiero.
5.  **🧘 Maestro Zen (Sabio Milenario)**: Ve el dinero como energía fluida. Sus respuestas son poéticas, profundas y compasivas. Busca la paz espiritual a través del desapego y la conciencia del flujo.
6.  **📊 Analista Profesional**: La versión sobria y ejecutiva. Orientada a la eficiencia operativa, recomendaciones estratégicas y claridad total.

### 🛠️ Arsenal de Herramientas (Function Calling)
La IA no adivina; consulta. Tiene acceso a **22 herramientas técnicas** para auditar tu sistema:
*   **Auditoría de Datos**: `get_audit_report`, `get_duplicate_transactions` (Detección de duplicados).
*   **Análisis de Flujo**: `get_cash_flow_context`, `get_monthly_summary`, `get_projection`.
*   **Control de Presupuesto**: `get_budget_status`, `get_all_budgets_status`.
*   **Patrimonio y Activos**: `get_assets_context`, `get_net_worth_history`.
*   **Compromisos**: `get_active_subscriptions`, `get_upcoming_reminders`, `get_active_goals`.
*   **Fiscal**: `get_fiscal_summary` (IVA y Retenciones proyectadas).
*   **Conciencia Ejecutiva**: `get_financial_executive_summary` (Visión 360 del sistema).

### 🛡️ Seguridad y Blindaje del Cerebro
El sistema implementa capas de seguridad estrictas en el prompting:
*   **Integridad Read-Only**: La IA tiene **PROHIBICIÓN ABSOLUTA** de escritura. Puede sugerir cambios, pero jamás crear o borrar registros por sí sola. Tú siempre tienes el control final.
*   **Cero Aritmética LLM**: La IA no suma ni resta manualmente; utiliza las funciones matemáticas del backend para evitar errores de cálculo (alucinaciones numéricas).
*   **Privacidad PII**: Los datos sensibles son anonimizados o referenciados mediante tokens antes de ser procesados por los modelos de lenguaje.

---

## 🗺️ Topografía del Sistema (Módulos y Capacidades)

### 📊 Panel Principal (Dashboard)
El centro de mando. Visualiza tu liquidez real, ingresos del mes y alertas críticas.
*   **Tip**: Haz clic en el indicador de **Integridad Matemática** para verificar que tus saldos cuadren perfectamente con tus transacciones.

### 💸 Transacciones y Módulo SRI Fiscal
Gestión de ingresos y egresos con cumplimiento tributario ecuatoriano.
*   **Característica**: Generación automática de anexos de gastos personales en **XML y JSON** con códigos oficiales (3290, 3300, etc.).
*   **Nota**: El sistema detecta automáticamente transferencias internas (`is_internal`) para no inflar artificialmente tus métricas de gasto.

### 🎯 Metas y Presupuestos
Planificación activa de tu futuro.
*   **Tip**: Configura presupuestos por categoría. La IA te avisará de manera proactiva (vía Sentinel) si tu ritmo de gasto actual pone en riesgo el cumplimiento del mes.

### 💳 Cuentas y Tarjetas de Crédito
Gestión de activos líquidos y pasivos financieros.
*   **Función**: Sincronización de **Límites de Crédito** y visualización de deuda neta real (Activos - Pasivos).

### ⏰ Recordatorios y Suscripciones
Control de gastos fijos y fechas críticas.
*   **Consejo**: Usa los recordatorios para servicios básicos; el sistema los integrará en tu flujo de caja proyectado a 30 días para que tu liquidez sea siempre real.

### 📸 Snapshots de Patrimonio
Cortes mensuales de tu salud financiera total. Incluye activos físicos (vehículos, tecnología) con **depreciación automática** calculada por tiempo.

---

## 🚀 Orquestación Automática (One-Click Setup)

Tabula Rasa incluye un motor de orquestación industrial basado en `menu.ps1` que elimina la fricción de instalación:
*   **Auto-Instalación**: Detecta y ofrece instalar Python 3.12 y Node.js automáticamente vía **Winget**.
*   **Self-Healing**: Si detecta que tu entorno virtual está corrupto o le faltan dependencias, lo repara automáticamente en el arranque.
*   **High-Speed Engine**: Utiliza `uv` para la gestión de paquetes, reduciendo tiempos de instalación de minutos a segundos.
*   **Gestión de Procesos**: Limpieza de puertos (8001/5173) y manejo de logs en segundo plano para una ejecución invisible y eficiente.

---

## 💎 Nivel de Ingeniería
*   **Idempotencia**: Los procesos de importación detectan duplicados mediante hashes únicos para evitar registros repetidos.
*   **Criptografía**: Seguridad en la gestión de llaves API locales.
*   **Normalización**: Conversión automática de centavos a dólares para precisión absoluta sin errores de redondeo binario.

---
*Desarrollado con obsesión por el detalle y la libertad financiera.* 🏛️✨
