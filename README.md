# 🏛️ TABULA RASA: Infraestructura de Soberanía Financiera Agentizada

Bienvenido al repositorio de **Tabula Rasa**. Este no es un simple rastreador de gastos; es un ecosistema financiero de **Grado Industrial** diseñado bajo el paradigma de **Local-First AI**. Tabula Rasa funciona como tu cerebro financiero privado, residiendo íntegramente en tu hardware. Elimina la dependencia de nubes corporativas y garantiza la privacidad absoluta de tu patrimonio, al tiempo que integra modelos fundacionales de Inteligencia Artificial como auditores, consejeros y procesadores de datos.

Este documento es un "Deep Dive" (análisis de Rayos X) exhaustivo de la arquitectura, las capacidades, el motor de inteligencia y la topografía de módulos del sistema.

---

## 🏗️ 1. Arquitectura de Sistemas y Visión de Ingeniería

El núcleo de Tabula Rasa fue concebido para operar bajo estrés, garantizando que jamás se pierda ni se corrompa un solo centavo de tu historial financiero.

### 🧬 El Stack Tecnológico y Persistencia
*   **Backend (El Motor Lógico)**: Construido en **FastAPI (Python 3.12)**. Utiliza Pydantic para una validación estricta de esquemas de datos y dependencias inyectables para un código modular y altamente testeable.
*   **Frontend (Centro de Mando UI)**: Desarrollado en **React 19** con **Vite** y **Tailwind CSS**. La interfaz aplica principios de **Glassmorphism**, creando un entorno inmersivo, responsivo y visualmente premium, con animaciones fluidas potenciadas por Framer Motion.
*   **Persistencia (Búnker de Datos)**: Emplea **SQLite en modo WAL (Write-Ahead Logging)**. El modo WAL permite lecturas y escrituras concurrentes sin bloqueos de base de datos, combinando la ligereza de un motor local con la robustez requerida para transacciones concurrentes asíncronas.
*   **Orquestación de IA**: Integración directa (vía SDK nativo) con **Gemini 3.1 Flash-Lite / Pro**, habilitando análisis multimodal (Vision), ejecución estructurada de herramientas (Function Calling) y generación de contenido tipado.

### 📐 Principios de Integridad y Robustez
*   **Aritmética en Centavos (Enteros)**: La regla de oro del sistema. **Todos los cálculos internos, balances y registros monetarios en la base de datos se operan en enteros (centavos).** Esto erradica matemáticamente los errores de punto flotante que destruyen aplicaciones financieras amateurs. Solo se convierten a dólares (`/ 100`) en la capa de presentación (UI).
*   **Idempotencia Criptográfica**: El motor de importación (`statement_intelligence.py` / `transaction_importer.py`) no inserta datos a ciegas. Genera un *hash* único por transacción (combinando fecha, monto, emisor y tokens de descripción). Si subes el mismo extracto bancario diez veces, el sistema ignorará los duplicados con precisión quirúrgica.
*   **Soft Deletes (Borrado Lógico)**: Los registros nunca se eliminan de la base de datos (`is_deleted = True`), permitiendo la reconstrucción de historiales de auditoría y evitando rupturas en las claves foráneas (Foreign Keys).
*   **Soberanía de Datos**: Tus balances, historiales y deudas jamás salen de tu red local. Cuando el sistema "piensa" usando la IA, se sanitiza la información (anonimización) para consultar el LLM como un "motor semántico ciego".

---

## 🧠 2. El Ecosistema de Inteligencia Agentizada

La IA en Tabula Rasa no es un chatbot sobrepuesto; es un ecosistema de agentes con "ojos" (multimodalidad), "manos" (Function Calling) y una memoria estructurada de tus hábitos. 

### 👁️ Capacidades Multimodales y Background
1.  **Statement Intelligence**: El sistema usa IA visual para leer extractos de tarjetas de crédito en PDF o imágenes. Extrae la fecha de corte, fecha de pago, pago mínimo y desglose de cuotas (diferidos) sin requerir plantillas rígidas por banco.
2.  **Sentinel Agent (`sentinel_service.py`)**: Un orquestador en segundo plano que vigila tu base de datos de manera autónoma. Analiza tus ritmos de gasto, evalúa tu liquidez contra tus deudas inminentes, y genera un "Health Score" con advertencias proactivas si detecta que tus gastos exceden tu proyección de ingresos.
3.  **Auditor de Anomalías (`anomaly_detector.py`)**: Rastrea "gastos hormiga", pagos duplicados silenciosos y desviaciones estándar en tu comportamiento mensual.

### 🎭 Las 6 Personalidades del Cerebro Financiero
El orquestador de chat adapta su comportamiento estructural según tu necesidad de asesoría:
1.  **🕵️‍♂️ Analista Senior (Forense Financiero)**: Busca discrepancias, correlaciones ocultas y fugas de capital. Trata tus finanzas como una investigación exhaustiva; es el modo a elegir para encontrar el "por qué" de una caída en la liquidez.
2.  **🔥 Modo Roast (Comedia Negra)**: Destruye tus malos hábitos con humor despiadado. Si gastas en trivialidades teniendo deudas, el Roast tomará tus números reales y creará analogías humillantes para forzar disciplina psicológica.
3.  **🎮 RPG Master (Game Master)**: Transforma tus finanzas en una campaña de rol. Tu saldo es tu "HP" (Health Points), las deudas son monstruos, y el ahorro es "farmeo". Si logras una meta, "subes de nivel". Inmersión total para la generación gamer.
4.  **⚡ Motivador Personal (Coach de Élite)**: Energía y exigencia. Compara tus finanzas con un deporte de alto rendimiento. Te dejará siempre un "ejercicio del día" (una acción financiera inmediata a tomar basado en tu déficit o superávit).
5.  **🧘 Maestro Zen (Sabio Milenario)**: Paz y perspectiva. Para cuando la ansiedad financiera te abruma. Usa metáforas naturales (ríos, semillas) para explicar el flujo del dinero, promoviendo el desapego y las decisiones en calma.
6.  **📊 Analista Profesional**: La configuración por defecto. Conciso, ejecutivo, directo al grano. Decisiones y métricas sin adornos.

### 🛠️ El Arsenal de Herramientas (Function Calling)
La IA tiene prohibido alucinar sumas de dinero. Para ello, tiene a su disposición **22 funciones (Tools)** que ejecutan SQL y cálculos exactos:
*   **Para Liquidez y Flujo**: `get_cash_flow_context`, `get_monthly_summary`, `get_projection`.
*   **Para Auditoría**: `get_audit_report`, `get_duplicate_transactions`, `get_recent_transactions`.
*   **Para Configuración**: `search_categories`, `search_accounts`.
*   **Para Estado General**: `get_budget_status`, `get_all_budgets_status`, `get_active_goals`, `get_active_subscriptions`, `get_upcoming_reminders`.
*   **Para Patrimonio**: `get_assets_context`, `get_net_worth_history`, `get_debt_summary`, `get_total_balance`, `get_account_balance`.
*   **Para Fiscal/Inteligencia Alta**: `get_fiscal_summary`, `get_financial_executive_summary`, `get_sentinel_health`, `get_credit_card_details`.

### 🛡️ Políticas de Blindaje de IA
*   **Read-Only Strict Enforcement**: La IA es un auditor, no un ejecutor. Tiene bloqueados los endpoints de escritura. Si el sistema considera que debes crear una meta, te sugerirá hacerlo, pero tú deberás accionar el botón en la interfaz. Cero mutaciones no deseadas.
*   **Zero-Arithmetic Rules**: Instrucciones sistémicas explícitas obligan a la IA a confiar únicamente en los totales que proveen sus herramientas `Function Call`.

---

## 🗺️ 3. Topografía de Módulos (Rayos X Operativo)

El frontend de Tabula Rasa abarca la contabilidad de partida doble de forma invisible para el usuario, distribuyendo la gestión en módulos lógicos.

### 📈 1. Panel de Control (Dashboard)
El centro de mando estratégico de tu vida financiera.
*   **Safe-to-Spend**: La métrica reina. No te dice cuánto dinero tienes, te dice *cuánto dinero puedes gastar hoy sin comprometer obligaciones futuras*. Resta de tu saldo actual los presupuestos activos, recordatorios, deudas programadas y un buffer de seguridad configurable.
*   **Diagrama Sankey**: Visualización dinámica de tu flujo de fondos mensual. Observa gráficamente cómo entra el dinero a tus cuentas y se bifurca hacia tus categorías de gasto o ahorro.
*   **Proyección Monte Carlo / Cashflow**: Línea de tiempo interactiva a 30, 60 y 90 días.
*   **💡 TIP**: Fíjate en el widget superior izquierdo "Integridad Matemática: 100%". Si no está al 100%, tienes transacciones sin conciliar.

### 💸 2. Transacciones
El libro mayor de tus finanzas.
*   **Clasificador Semántico**: Si olvidas asignar categoría, la IA infiere la naturaleza del gasto según la descripción y el historial pasado (`categorizer.py`).
*   **Filtro Interno (`is_internal`)**: Excluye transferencias entre tus propias cuentas del cálculo de gastos para no "inflar" la estadística de consumo mensual.
*   **Splits (Transacciones Divididas)**: Permite tomar un solo ticket de supermercado y dividirlo entre "Alimentación", "Limpieza" y "Mascotas", para presupuestos granulares.

### 🏦 3. Cuentas y Tarjetas (Account Intelligence)
*   **Tarjetas de Crédito**: Manejan ciclos de facturación, fecha de corte y pago mínimo. El módulo `account_intelligence.py` rastrea cuánto de tu límite de crédito has consumido y alerta sobre endeudamiento riesgoso.
*   **Conciliación Bancaria**: Herramientas para empatar saldos físicos con saldos lógicos.

### 🎯 4. Metas y 📊 5. Presupuestos
*   **Presupuestos Proactivos**: Límites de gasto por categoría.
*   **Metas con Proyección**: Defines un objetivo (ej. "Viaje a Japón - $4000"). El sistema evalúa tu ratio de ahorro de los últimos 3 meses y te calcula matemáticamente en qué mes y año exacto lograrás tu meta.

### 🤝 6. IOUs & Deudas Compartidas (Economía Colaborativa)
*   **IOU (I Owe You / They Owe Me)**: Rastreo informal de dinero prestado.
*   **Debt Shares**: Si compras una pizza con tu tarjeta y tus amigos te transfieren su parte, el sistema consolida (`debt_consolidator.py`) esos pagos a tu favor restándolos de tu deuda bruta. Por eso tu "Deuda Neta" refleja la realidad de tu bolsillo.

### 🏎️ 7. Telemetría de Vehículos
*   Tabula Rasa intercepta pagos etiquetados como combustible o mantenimiento, pide que ingreses el odómetro (kilometraje), y procesa:
    *   Costo exacto de gasto por Kilómetro (Cost per KM).
    *   Proyección predictiva de cuándo necesitarás el siguiente mantenimiento de los 5,000 KM.

### 📸 8. Snapshots de Patrimonio
*   Congela tu "Net Worth" el último día del mes.
*   **Depreciación Inteligente (`asset_depreciation.py`)**: Das de alta un teléfono o un auto como "Activo Físico". El sistema usa fórmulas contables para restarle valor cada mes automáticamente. Tu patrimonio reportado disminuye gradualmente, previniendo falsas ilusiones de riqueza líquida.

### 🏛️ 9. Centro Fiscal (SRI Compliance)
Específicamente adaptado para contribuyentes (ej. Ecuador).
*   **Mapeo SRI Automático**: Toma tus consumos y los clasifica bajo los Conceptos Oficiales deducibles (3290 Salud, 3300 Alimentación, 3310 Vivienda, etc.) vía `sri_classifier.py`.
*   **Exportación XML y JSON**: Genera anexos de deducciones personales normalizados en el formato estricto de la autoridad fiscal (separador decimal, códigos enteros, sin valores nulos).
*   **💡 TIP**: El centro fiscal ignora consumos de ocio y solo extrae lo matemáticamente deducible, ahorrando horas de contabilidad a fin de año.

---

## 🌐 4. Seguridad, PWA y Offline-First

*   **Aplicación Web Progresiva (PWA)**: El frontend instalable localmente se sincroniza usando IndexedDB.
*   **Red Local (Zero-Trust)**: Existe un mecanismo de autenticación (QR Pairing) para usar tu aplicación web móvil sincronizándose contra tu propia PC de escritorio bajo la misma red local Wi-Fi.

---

## 🚀 5. Orquestación y DevOps (Zero-Friction Setup)

La magia detrás del arranque del proyecto radica en un script maestro de PowerShell: `menu.ps1`. Está programado para ofrecer una experiencia empresarial con *Zero-Touch Configuration*.

### ⚙️ Capacidades del Motor `menu.ps1`
1.  **Auditoría de Entorno (Auto-Provisioning)**: Al arrancar, verifica versiones de Python y Node.js. Si no existen, dispara una instalación en segundo plano utilizando el gestor de paquetes de Windows (`Winget`).
2.  **Ultra-Speed Package Management (`uv`)**: Instala e inyecta `uv` (el instalador de Python escrito en Rust). Esto permite construir el entorno virtual e instalar los `requirements.txt` en escasos segundos, dejando obsoleto a `pip`.
3.  **Self-Healing (Auto-Curación)**: Antes de lanzar el servidor de FastAPI, el script ejecuta módulos de test (importando Pydantic y SQLAlchemy en silencio). Si detecta que tu carpeta `venv` está corrupta, destruye el entorno virtual de manera segura y lo vuelve a construir sin pedir permiso. Siempre arrancarás con un estado limpio.
4.  **Asesino de Zombies (Port Management)**: Si un fallo del sistema dejó el puerto 8001 o 5173 enganchado en segundo plano, el script identifica el PID del proceso huérfano, lo aniquila, y libera los puertos antes de intentar levantar los servicios.
5.  **Observabilidad en Tiempo Real**: Ofrece un sistema en el terminal de monitoreo paralelo (`tail -f`) para ver los logs del Backend y Frontend sin detener la aplicación.

### 🏃‍♂️ Guía Rápida de Despliegue
```bash
# 1. Clona el repositorio
git clone https://github.com/Alanjavier22/Tabula-Rasa.git

# 2. En Windows, ejecuta el instalador automatizado
.\menu.ps1

# 3. El script hará todo el trabajo pesado. Abre tu navegador en:
http://localhost:5173
```

---

## 📜 Historial de Versiones
Para entender la evolución profunda del código, las refactorizaciones de algoritmos y el despliegue del ecosistema de IA, consulta el archivo `HISTORIAL.md`. 

---
**Tabula Rasa** • *Finanzas limpias. Privacidad absoluta. Inteligencia implacable.* 🏛️✨
