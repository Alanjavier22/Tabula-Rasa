# 🏛️ TABULA RASA
### Infraestructura de Soberanía Financiera Agentizada (Grado Industrial)

> **"Finanzas limpias. Privacidad absoluta. Inteligencia implacable."**

Bienvenido al repositorio de **Tabula Rasa**. Este no es un simple rastreador de gastos; es un ecosistema financiero de **Grado Industrial** diseñado bajo el paradigma de **Local-First AI**. Tabula Rasa funciona como tu cerebro financiero privado, residiendo íntegramente en tu hardware. Elimina la dependencia de nubes corporativas y garantiza la privacidad absoluta de tu patrimonio, al tiempo que integra modelos fundacionales de Inteligencia Artificial como auditores, consejeros y procesadores de datos multimodales.

Este documento es un "Deep Dive" (análisis de Rayos X) exhaustivo de la arquitectura, las capacidades, el motor de inteligencia y la topografía de módulos del sistema. Ningún detalle técnico ha sido omitido.

---

## 🏗️ 1. Arquitectura de Sistemas y Visión de Ingeniería

El núcleo de Tabula Rasa fue concebido para operar bajo un estrés constante de cálculo financiero, garantizando que jamás se pierda ni se corrompa un solo centavo de tu historial.

### 🧬 El Stack Tecnológico y Persistencia
*   **Backend (El Motor Lógico)**: Construido en **FastAPI (Python 3.12)**. Elegido por su insuperable capacidad de procesamiento asíncrono y la validación de datos estricta mediante **Pydantic**.
*   **Frontend (Centro de Mando UI)**: Desarrollado en **React 19** impulsado por **Vite** y estandarizado con **Tailwind CSS**. La interfaz aplica principios de diseño **Glassmorphism**, creando un entorno inmersivo, responsivo y visualmente premium, con micro-animaciones fluidas a 60FPS potenciadas por **Framer Motion**.
*   **Persistencia (El Búnker de Datos)**: Emplea **SQLite en modo WAL (Write-Ahead Logging)**. A diferencia de un SQLite tradicional que bloquea la base en cada escritura, el modo WAL permite lecturas y escrituras concurrentes, combinando la ligereza de un motor local de un solo archivo con la robustez requerida para transacciones asíncronas y scripts en background.
*   **Orquestación de IA**: Integración directa (vía SDK nativo) con **Gemini 3.1 Flash-Lite / Pro**, habilitando análisis multimodal (Vision), ejecución estructurada de herramientas (Function Calling) y generación de contenido altamente tipado y determinista.

### 📐 Principios de Integridad y Robustez (Core Rules)
1.  **Aritmética de Centavos (Cero Coma Flotante)**: Es la regla de oro del motor matemático. Todos los cálculos internos, balances, deducciones y registros monetarios en la base de datos se almacenan y operan en **enteros (centavos)**. Esto erradica matemáticamente los errores de redondeo binario que destruyen las aplicaciones financieras amateurs. Solo se convierten a dólares (`/ 100`) en la capa final de presentación de la UI.
2.  **Idempotencia Criptográfica**: El motor de importación (`transaction_importer.py` y `statement_intelligence.py`) jamás inserta datos a ciegas. Genera un *hash SHA-256* único por transacción (combinando fecha, monto, emisor y tokens de descripción). Si el usuario sube el mismo extracto bancario CSV o PDF diez veces, el sistema ignorará los duplicados con precisión quirúrgica, previniendo el envenenamiento de los datos de flujo de caja.
3.  **Soft Deletes (Borrado Lógico Inmutable)**: Los registros nunca se eliminan físicamente de la base de datos (`is_deleted = True`). Esto permite la reconstrucción total de historiales de auditoría en caso de errores del usuario y evita rupturas silenciosas en las restricciones de las claves foráneas (Foreign Keys).
4.  **Soberanía de Datos (Local-First)**: Tus balances, historiales, deudas y configuración jamás salen de tu red local. La base de datos reside únicamente en tu disco duro. Cuando el sistema "piensa" usando la IA, se aplica un protocolo de desinfección, enviando únicamente el contexto necesario (anonimizado) para que el LLM opere como un "motor semántico ciego".
5.  **Arquitectura PWA y Sync de Red Local**: El frontend está diseñado como una Progressive Web App (PWA) e intercepta su propio tráfico (Service Workers / IndexedDB) permitiendo un mecanismo de "Zero-Trust Pairing" mediante códigos QR para acceder a tu propia PC desde tu teléfono móvil dentro de tu misma red Wi-Fi.

---

## 🧠 2. El Ecosistema de Inteligencia Agentizada

La IA en Tabula Rasa no es un "chatbot" superficial; es un **ecosistema de agentes autónomos y reactivos** con "ojos" (multimodalidad), "manos" (Function Calling) y una memoria estructurada de tus hábitos financieros. 

### 👁️ Capacidades Multimodales y Background Autónomo
1.  **Statement Intelligence (Motor Vision)**: El sistema utiliza IA visual para ingerir y leer extractos de tarjetas de crédito en PDF o imágenes fotográficas. Es capaz de extraer sin intervención manual la fecha de corte, fecha de pago, pago mínimo, cupo utilizado y desglose de cuotas (diferidos) sin depender de plantillas rígidas pre-programadas por banco.
2.  **Sentinel Agent (`sentinel_service.py`)**: Un orquestador que vigila tu base de datos en segundo plano. Analiza tus ritmos de gasto ("burn rate"), evalúa tu liquidez contra tus deudas inminentes, y genera un "Health Score" (Score de Salud) dinámico. Despliega advertencias proactivas si detecta que la trayectoria de tus gastos excederá tu proyección de ingresos.
3.  **AI Anomaly Scanner (`anomaly_detector.py`)**: Auditoría profunda constante que rastrea pagos duplicados silenciosos, "gastos hormiga" no detectados, suscripciones olvidadas y desviaciones estándar aberrantes en tu comportamiento de gasto mensual.
4.  **Continual Pattern Learning**: Sistema de aprendizaje pasivo. Si el usuario corrige una categoría sugerida erróneamente por el importador, el motor de IA aprende de esta corrección manual y actualiza su base de pesos de similitud semántica para clasificar perfectamente transacciones similares en el futuro.

### 🎭 Las 6 Personalidades del Cerebro Financiero
El orquestador de chat de la aplicación adapta su comportamiento estructural, léxico y profundidad de razonamiento según la faceta de asesoría que selecciones:

1.  **🕵️‍♂️ Analista Senior (Forense Financiero)**:
    *   *Propósito*: Auditoría profunda, detección de anomalías y resolución de problemas.
    *   *Comportamiento*: Trata tus estados de cuenta como una escena del crimen y tu dinero perdido como "el sospechoso". Busca discrepancias lógicas, correlaciones ocultas y fugas de capital estructurales. Es el modo a elegir para encontrar el "por qué" de una caída drástica en la liquidez.
2.  **🔥 Modo Roast (Comedia Negra Financiera)**:
    *   *Propósito*: Disciplina conductual a través de la vergüenza cómica.
    *   *Comportamiento*: Brutalmente honesto y sarcástico. Utiliza tus propios datos para ridiculizar tus peores decisiones. Si gastas dinero en salidas teniendo deudas de tarjetas de crédito, el Roast tomará tus números reales y creará analogías humillantes e impredecibles para forzar disciplina psicológica.
3.  **🎮 RPG Master (Game Master)**:
    *   *Propósito*: Gamificación de la economía personal para perfiles jóvenes o lúdicos.
    *   *Comportamiento*: Transforma tus finanzas en una campaña de rol épica. Tu saldo líquido es tu barra de vida ("HP"), tus metas son "Misiones Principales", tus gastos impulsivos son "Debuffs de Estado" o ataques de monstruos. Si ahorras, estás "farmeando oro". La inmersión es total.
4.  **⚡ Motivador Personal (Coach de Élite)**:
    *   *Propósito*: Optimización agresiva del rendimiento financiero y empoderamiento.
    *   *Comportamiento*: Enérgico, exigente e inspirador. Compara tu salud financiera con un deporte de alto rendimiento. Te empuja a ahorrar más agresivamente y te obliga a ver cada dólar como un soldado que debe trabajar para ti. Termina cada consulta imponiendo un "ejercicio financiero del día" específico a tus números.
5.  **🧘 Maestro Zen (Sabio Milenario)**:
    *   *Propósito*: Conciencia, reflexión y paz financiera.
    *   *Comportamiento*: Poético y profundo. Ve el dinero como una energía puramente fluida. Sus respuestas buscan el equilibrio entre el disfrute del presente y la seguridad del futuro, promoviendo el desapego y la reducción drástica de la ansiedad económica.
6.  **📊 Analista Profesional**:
    *   *Propósito*: Eficiencia operativa pura para decisiones de negocios.
    *   *Comportamiento*: La configuración base. Tono ejecutivo, sobrio y directo. Cero adornos literarios, 100% centrado en datos accionables, retorno de inversión y métricas duras.

### 🛠️ El Arsenal de Herramientas de IA (Function Calling)
La IA de Tabula Rasa tiene **estrictamente prohibido alucinar sumas matemáticas**. Para razonar, tiene a su disposición un arsenal de **22 funciones (Tools)** que ejecutan consultas SQL complejas en el backend para proporcionarle contexto en tiempo real:

| Categoría | Funciones Expuestas al LLM | Propósito Operativo |
| :--- | :--- | :--- |
| **Flujo de Caja** | `get_cash_flow_context`, `get_projection`, `get_monthly_summary` | Permitir a la IA proyectar simulaciones Monte Carlo, evaluar supervivencia de fondos a 30/60/90 días y comparar desempeños históricos. |
| **Auditoría** | `get_audit_report`, `get_duplicate_transactions`, `get_recent_transactions` | Extraer transacciones huérfanas, candidatos a duplicidad y patrones de "quemado" de fondos inmediatos. |
| **Búsqueda / Resolución** | `search_categories`, `search_accounts` | Resolver UUIDs semánticamente cuando el usuario pregunta por "comida" o "banco pichincha". |
| **Control de Gastos** | `get_budget_status`, `get_all_budgets_status` | Analizar porcentajes de consumo de presupuesto para alertar desviaciones de la meta mensual. |
| **Obligaciones Fijas** | `get_active_subscriptions`, `get_upcoming_reminders` | Analizar compromisos ineludibles que la IA debe restar de tu "Safe-to-Spend" real. |
| **Patrimonio Integral** | `get_assets_context`, `get_net_worth_history`, `get_debt_summary`, `get_total_balance`, `get_account_balance` | Entender la riqueza global, la carga de deudas personales (IOUs) y el desempeño del patrimonio neto ("Net Worth") a lo largo del tiempo. |
| **Inteligencia Fiscal/Alta** | `get_fiscal_summary`, `get_financial_executive_summary`, `get_sentinel_health`, `get_credit_card_details` | Ejecutar proyecciones del IVA, revisar el "Health Score" global del Sentinel y evaluar riesgos en fechas de corte de tarjetas de crédito. |

### 🛡️ Políticas de Blindaje y Seguridad del Prompting
*   **Read-Only Strict Enforcement**: La IA es fundamentalmente un auditor inteligente, no un ejecutor a ciegas. Tiene **bloqueados todos los endpoints de escritura y mutación (POST/PUT/DELETE)** en su definición de tools. Si el motor infiere que debes crear una nueva meta financiera o ajustar un presupuesto, te lo sugerirá verbalmente, pero el usuario debe ser quien realice la acción mediante un clic en la interfaz. Cero mutaciones en la sombra.
*   **Zero-Arithmetic Rules**: Instrucciones sistémicas explícitas prohíben a la IA realizar aritmética profunda. Si requiere un total, se le obliga a llamar a una función del backend.
*   **Time-Context Injection**: El sistema inyecta en milisegundos la hora exacta y zona horaria (`America/Guayaquil`) en el prompt del sistema antes de cada turno. Esto evita que la IA se desoriente temporalmente y garantiza que las evaluaciones de vencimientos (Due Dates) sean milimétricamente exactas a la realidad.

---

## 🗺️ 3. Topografía de Módulos (Rayos X Operativo)

El frontend de Tabula Rasa abarca toda la complejidad de la contabilidad de partida doble, escondiéndola detrás de 9 módulos lógicos altamente especializados.

### 📈 1. Panel de Control (Dashboard)
El centro de mando neurálgico estratégico.
*   **Métrica Estrella: Safe-to-Spend**: No te dice "cuánto dinero hay en el banco". El algoritmo suma tus saldos, le resta tus presupuestos comprometidos del mes, le resta las suscripciones que están por cobrarse, le resta un "colchón de seguridad" configurable, y te dice *cuánto dinero líquido puedes gastar HOY sin arruinar tu planificación mensual*.
*   **Diagrama Sankey en Vivo**: Visualización termodinámica de tu flujo de fondos. Observa gráficamente los "ríos" de dinero entrando a tus cuentas y cómo se ramifican hacia tus distintas categorías de gasto, pasivos o ahorros.
*   **Integridad Matemática (Health Indicator)**: Un pequeño widget superior que audita el 100% de la base de datos. Si baja de 100%, significa que tienes transacciones huérfanas o saldos manuales que no empatan con el libro mayor.
*   **Simulador "What-If" (Máquina del Tiempo)**: Módulo de proyección condicional. Interfaz donde puedes probar escenarios futuros (ej. *"¿Qué pasa con mi liquidez si saco un préstamo de $10,000 al 12% para un auto y aumenta mi seguro mensual?"*) e inyecta estas deudas hipotéticas para recalcular toda tu gráfica de flujo de caja.

### 💸 2. Transacciones
El "Libro Mayor" inmutable de tus finanzas.
*   **Categorizador Semántico (`categorizer.py`)**: Asignación predictiva de categorías basada en reglas KNN de historial pasado.
*   **Bandera de Integridad `is_internal`**: Un mecanismo vital. Te permite marcar un pago de tu banco A hacia tu tarjeta B como "Interno". El sistema lo procesará, pero lo excluirá de los cálculos estadísticos de "Gastos Mensuales" para no inflar artificialmente tu percepción de consumo.
*   **Sistema de Splits (Divisiones)**: Si vas a un hipermercado y compras comida, papel higiénico y comida para perro, puedes abrir el ticket de esa sola transacción y crear múltiples "splits" internos para que cada fracción afecte al presupuesto correcto (Alimentación, Hogar, Mascotas).

### 🏛️ 3. Módulo Fiscal SRI (Cumplimiento Automatizado)
Específicamente adaptado para contribuyentes fiscales (enfocado en las complejas normas del SRI de Ecuador, extensible a otros).
*   **Mapeo SRI en Background**: A través de `sri_classifier.py`, el sistema toma de forma silenciosa tus consumos del año y los asocia automáticamente con los Conceptos Oficiales deducibles definidos por la ley (ej. 3290 Salud, 3300 Alimentación, 3310 Vivienda, 5040 Educación). Ignora automáticamente consumos de Ocio o categorías no deducibles.
*   **Generador Multiformato (Anexos)**: Cuenta con un motor de exportación que traduce tus transacciones y las empaqueta en formatos estrictos **XML y JSON**, respetando las jerarquías de etiquetas (`<detallesDeclaracion>`), normalizando decimales con separación de punto `.`, excluyendo campos nulos e integrando RUCs contables. Descarga archivos 100% listos para importar al portal tributario.

### 💳 4. Cuentas y Tarjetas (Account Intelligence)
Gestión del ecosistema bancario completo.
*   **Diferenciación de Naturaleza**: Separa matemáticamente cuentas líquidas (Checking/Savings) de líneas de crédito.
*   **Cálculo de Deuda Neta**: Calcula tu posición real neta cruzando el dinero físico que posees contra los pasivos corrientes de tarjetas.
*   **Statement Intelligence**: Registra las fechas de corte de las tarjetas para mover tus pagos entre meses lógicos y no meses calendario.

### 🎯 5. Metas y 📊 6. Presupuestos
Ingeniería predictiva del futuro.
*   **Presupuestos Proactivos**: Establecimiento de techos de gasto por categoría con barras de progreso que cambian de color (verde, amarillo, rojo) según el ritmo de "quemado" diario.
*   **Metas Inteligentes**: Definiendo un objetivo (ej. "Fondo de Emergencia - $5000"), el sistema analiza de forma dinámica tu ratio real de ahorro (ingresos netos - gastos netos promediados) y calcula exactamente la fecha (mes/año) en la que alcanzarás la meta si mantienes tu disciplina.

### 🕰️ 7. Recordatorios y Suscripciones
Protección contra recargos e impagos.
*   **Automatización de Obligaciones**: Cargas las fechas y periodicidades de Spotify, Netflix, la luz, el agua o el alquiler.
*   **Impacto de Liquidez**: Estas deudas fijas no son solo notificaciones pasivas; el sistema las absorbe y deduce de tu proyección "Safe-to-Spend" a 30 días, garantizando que ese dinero quede inmovilizado virtualmente y no creas que "te sobra plata".

### 🤝 8. Economía Colaborativa (IOUs & Debt Shares)
Manejo exhaustivo del dinero P2P ("Peer to Peer") en tu círculo social.
*   **IOU (I Owe You / They Owe Me)**: Sistema dual para registrar el dinero líquido informal que prestas o que te prestan amigos y familiares.
*   **Debt Shares (Consolidador de Deudas)**: Si sales a comer, pagas toda la cuenta con tu tarjeta de crédito para sumar millas, y luego tus 4 amigos te transfieren su parte. Tabula Rasa vincula esas transferencias entrantes ("Debt Shares") al saldo original de la tarjeta, reconociendo que tu deuda real sobre ese consumo es solo tu fracción, evitando la corrupción de tu balance de Deuda Neta.

### 🏎️ 9. Telemetría de Vehículos
*   **Interceptación Paramétrica**: Cuando el sistema detecta que has registrado un consumo categorizado como "Combustible" o "Mantenimiento Vehicular", habilita un campo metadata especial para que introduzcas la lectura actual de tu odómetro (Kilometraje).
*   **Analíticas Vehiculares**: Con esos datos a través del tiempo, Tabula Rasa cruza la distancia recorrida contra los dólares invertidos para darte tu **Costo Real por Kilómetro** histórico, al tiempo que dispara un pronóstico regresivo avisando cuántos kilómetros te faltan para el crítico mantenimiento de los 5,000 KM.

### 📸 10. Snapshots de Patrimonio (Net Worth)
*   **Fotografía Mensual**: En los últimos minutos del último día de cada mes, el sistema crea un "Snapshot" inmutable y consolidado de todos tus activos, pasivos y posiciones financieras, formando el gran libro mayor histórico de tu crecimiento económico.
*   **Depreciación Activa de Activos Físicos (`asset_depreciation.py`)**: Puedes registrar propiedades, computadoras o vehículos en la sección "Activos Físicos". El algoritmo contable de Tabula Rasa aplicará fórmulas de depreciación mensual (amortización temporal) para rebajar el valor de ese teléfono o ese auto conforme pasan los meses. Tu curva de Patrimonio Neto reflejará una realidad financiera dura pero precisa, evitando ilusiones de riqueza líquida basadas en bienes que se están devaluando.

---

## 🚀 4. Orquestación y DevOps (Zero-Friction Setup)

La verdadera "magia" de instalación detrás del proyecto reside en su monumental script maestro de PowerShell: `menu.ps1`. Ha sido programado con técnicas de sistemas operativos de misión crítica para ofrecer una experiencia empresarial de *Zero-Touch Configuration*.

### ⚙️ Capacidades del Motor de Orquestación (`menu.ps1`)
1.  **Auto-Provisioning por Winget**: Apenas arranca, el script escanea el PATH del sistema buscando las ejecuciones de **Python 3.12+** y **Node.js**. Si no los encuentra, lanza una instalación silenciosa nativa utilizando `Winget` (El gestor de paquetes de Windows de Microsoft). El usuario no necesita buscar webs de descargas, ni configurar variables de entorno manualmente.
2.  **Aceleración Extrema con `uv`**: Tras instalar Python, el script descarga e inyecta `uv` (El reemplazo a `pip` escrito en lenguaje Rust). Utilizando `uv`, la instalación masiva de las dependencias científicas, matemáticas e IA del archivo `requirements.txt` toma un par de segundos en lugar de minutos.
3.  **Self-Healing (Curación Automática)**: Cada vez que presionas "Iniciar Aplicativo", el script lanza rutinas de test silenciosas. Intenta importar de forma subyacente librerías críticas (`pydantic`, `sqlalchemy`, `fastapi`). Si detecta un "ImportError" (indicando que tu entorno virtual `venv` está corrupto o carece de bibliotecas), el script destruye el `venv` agresivamente y lo vuelve a ensamblar desde cero de manera invisible. Siempre arrancarás en un entorno inmaculado.
4.  **Asesino de Zombies (Port Management Quirúrgico)**: Si cerraste bruscamente el terminal en el pasado y los procesos de servidor quedaron atrapados como "zombies" devorando recursos, el script ejecuta un barrido TCP, localiza el PID exacto que secuestró los puertos `8001` y `5173`, y ejecuta un `Stop-Process -Force` para liberarlos, previniendo el temido error "Address already in use".
5.  **Observabilidad en Tiempo Real**: El menú 3 ("Ver Logs") implementa un bucle dinámico que emula el comando `tail -f` de los servidores Linux. Permite al usuario monitorizar las salidas estándar e interceptar errores tanto del motor de FastAPI como de Vite/React de forma simultánea sin interrumpir su ejecución principal en background.

---

## 🛠️ 5. Guía de Inicio Rápido (Para Usuarios y Desarrolladores)

### Requisitos Mínimos del Hardware
*   **Sistema Operativo**: Windows 10/11 (Requiere acceso a PowerShell Administrativo para auto-configuraciones).
*   **Memoria RAM**: 4GB Mínimo (8GB Recomendado para un entorno React fluido).
*   **Conexión a Internet**: Exclusiva para la latencia baja de comunicación con la API de Gemini (la base de datos opera completamente sin conexión).

### Instalación en 1 Paso
El objetivo de este proyecto es que su levantamiento no requiera conocimientos de programación.
1.  **Paso 1**: Descarga o clona este repositorio en tu máquina.
    ```bash
    git clone https://github.com/Alanjavier22/Tabula-Rasa.git
    ```
2.  **Paso 2**: En tu explorador de archivos de Windows, haz doble clic en el archivo **`iniciar.bat`**. (O ejecuta `.\menu.ps1` desde una terminal si eres un usuario avanzado).
3.  **Paso 3**: El sistema orquestador se encargará de instalar todo lo necesario, configurará las variables de entorno, levantará el backend y el frontend, y abrirá una ventana en tu navegador por defecto apuntando a: `http://localhost:5173`.
4.  **Paso 4**: El sistema te pedirá añadir la clave de la API de Gemini en la pantalla de Configuración para desbloquear los módulos de IA.

---

## 📂 6. Estructura de Directorios Clave

```text
TABULA-RASA/
├── backend/                       # Motor Lógico y Base de Datos (Python/FastAPI)
│   ├── app/
│   │   ├── api/                   # Controladores RESTful
│   │   ├── models/                # Modelos ORM (SQLAlchemy)
│   │   └── services/              # Lógica de Negocios, Orquestación IA y Telemetría
│   ├── main.py                    # Punto de entrada de la aplicación
│   └── requirements.txt           # Dependencias de Python
├── frontend/                      # Centro de Control Visual (React/Vite)
│   ├── src/
│   │   ├── components/            # Elementos reutilizables UI (Glassmorphism)
│   │   ├── pages/                 # Los 10 módulos lógicos de la topografía
│   │   └── services/              # Clientes de API e IndexedDB
│   ├── index.css                  # Framework de estilos Tailwind
│   └── package.json               # Dependencias de Node
├── .agents/                       # Habilidades, prompts persistentes y módulos de LLM
├── menu.ps1                       # 🧠 Orquestador Industrial de DevOps
├── iniciar.bat                    # Script de conveniencia para Windows
└── README.md                      # Este manifiesto
```

---
> **HISTORIAL DE INGENIERÍA**: 
> Te invitamos a leer el archivo **`HISTORIAL.md`** adjunto en este repositorio para comprender a detalle el progreso cronológico de las optimizaciones, resoluciones de bugs, "refactorings" de código y las decisiones arquitectónicas clave (ADRs) documentadas semana a semana a lo largo de este proyecto de alto calibre.

---
*Desarrollado con una obsesión irreductible por el detalle, la limpieza del código y el derecho universal a la soberanía financiera local.* 🏛️✨
