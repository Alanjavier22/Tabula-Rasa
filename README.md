<div align="center">

# 🏛️ Tabula Rasa
### Sistema Operativo Financiero Soberano & AI-Agentic Ecosystem

*Privacidad blindada, integridad matemática absoluta (Zero-Floating-Point) y orquestación autónoma impulsada exclusivamente por **Gemini 3.1 Flash-Lite**.*

![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-109989?style=for-the-badge&logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite_WAL-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)
![Gemini AI](https://img.shields.io/badge/🤖_Gemini_3.1_Flash--Lite-orange?style=for-the-badge)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS_Glassmorphism-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)
![TanStack Query](https://img.shields.io/badge/React_Query-FF4154?style=for-the-badge&logo=react-query&logoColor=white)

</div>

---

## 👁️ Visión Arquitectónica y Filosofía: Soberanía de Datos

**Tabula Rasa** trasciende el concepto de un "gestor de gastos". Es un entorno financiero de arquitectura **Thin Client**, diseñado con un rigor técnico impecable y una estética **Ultra-Premium**. Construido para la era de la IA, pero con la privacidad absoluta como regla inquebrantable.

* 🔒 **Local-First (Zero-Cloud)**: Toda la base de datos, el historial de transacciones, los tokens de autenticación y las proyecciones residen **exclusivamente en tu entorno local**. El sistema es el dueño de los datos, no un servidor de terceros.
* 🧮 **Integridad Matemática Absoluta**: La precisión es imperativa. Toda la gestión financiera se procesa y almacena en precisión entera (centavos) en el Backend y mediante `decimal.js-light` en el Frontend, erradicando por completo las inconsistencias del estándar de coma flotante IEEE-754.
* 🤝 **La IA como Motor de Razonamiento, NO como Custodio**: La inteligencia artificial (*Gemini 3.1 Flash-Lite*) interactúa con la información mediante **Function Calling** (Tool Use). Procesa la data en ventanas de contexto efímeras y en tiempo real. **Tus datos nunca entrenan modelos.**

---

## 🧠 El Ecosistema de Inteligencia Agentizada (AI-Driven)

Tabula Rasa no tiene un simple "chatbot". Integra una compleja red de agentes autónomos y personalidades especializadas que operan como tu junta directiva financiera. Todo impulsado por la velocidad y eficiencia del modelo **Gemini 3.1 Flash-Lite**.

### 🛡️ Sentinel (Orquestador Central Autónomo)
El *Sentinel* no espera a que le preguntes. Es un agente que corre análisis en segundo plano sobre tu base de datos local y presenta inteligencia procesable directamente en tu Dashboard.
* **Health Score Dinámico**: Evalúa constantemente tu liquidez, nivel de endeudamiento y ritmo de gasto mensual.
* **Proyección de Runway**: Calcula exactamente cuántos meses puedes sobrevivir con tu nivel de gasto actual (Burn Rate) si tus ingresos se detienen hoy.
* **Alertas Predictivas**: Detecta si tu trayectoria de gasto en una categoría específica (ej. "Comida a Domicilio") excederá el presupuesto antes de que termine el mes.

### 🎭 Personalidades de IA Modulares (Expertos en Demanda)
El asistente interactivo puede adoptar "system prompts" extremadamente detallados según lo que necesites:

1. 💼 **Asesor Financiero (Wealth Advisor)**: Analítico, formal y enfocado en el crecimiento patrimonial. Su objetivo es optimizar tu *Safe to Spend* (Monto Seguro para Gastar) y sugerir reasignaciones de capital basadas en tu historial.
2. ⚠️ **Analista de Riesgos**: Extremadamente conservador. Su labor es auditar tu relación deuda-ingreso (DTI), advertir sobre sobreapalancamiento en tarjetas de crédito y simular los peores escenarios.
3. 🔥 **Financial Roast Mode**: Un coach financiero sádico, brutalmente honesto y sarcástico. Creado para forjar disciplina a base de críticas ácidas. Te hará sentir culpable por cada dólar gastado en caprichos innecesarios.
4. 🇪🇨 **Especialista SRI (Ecuador)**: Configurado con la ley tributaria vigente. Se enfoca en categorizar gastos deducibles (Salud, Vivienda, Educación, Vestimenta, Alimentación) y proyectar tu declaración de Impuesto a la Renta.

### 🔬 Herramientas de IA Especializadas (Tools)
* 👁️ **Statement Intelligence (Multimodal Vision)**: Motor OCR integrado. Arrastra una foto de un recibo o un extracto bancario; la IA extrae el monto exacto, identifica el comercio, asume la categoría semántica y pre-llena el formulario de transacción.
* ✨ **Simulador "What-If" (Máquina del Tiempo)**: Motor de proyección condicional. Le preguntas a la IA: *"¿Qué pasa con mi liquidez si saco un préstamo de $10,000 al 12% a 3 años para comprar un auto?"*. El simulador inyecta esa deuda hipotética y recalcula toda tu gráfica de flujo de caja proyectada a 90 días en el Dashboard.
* 🔎 **AI Anomaly Scanner**: Auditoría profunda que rastrea pagos duplicados, micropagos silenciosos (suscripciones olvidadas) y desviaciones estándar aberrantes en tu comportamiento de gasto mensual.

---

## 🛠️ Nivel de Ingeniería y Robustez Técnica

Cada línea de código de Tabula Rasa está concebida bajo estándares de software de alto rendimiento, optimizado para operaciones locales sin fricción.

### 🧱 Backend: Alto Rendimiento y Consistencia (Python / FastAPI)
* **Concurrencia Extrema**: La base de datos SQLite opera bajo el pragma `WAL` (Write-Ahead Logging). Integrada con **SQLAlchemy 2.0** asíncrono, permite miles de lecturas y escrituras concurrentes sin el bloqueo tradicional de SQLite.
* **Inyección de Dependencias Robusta**: Uso intensivo del sistema de inyección de FastAPI para gestionar sesiones de base de datos seguras (`get_db`) y servicios modulares, manteniendo un acoplamiento débil y alta testabilidad.
* **Deduplicación Criptográfica (Zero-Duplicates)**: Para evitar registrar transacciones repetidas al importar archivos masivos, cada transacción genera un **Fingerprint SHA-256** único (basado en fecha, monto, hash de descripción y cuenta). Es matemáticamente imposible duplicar un registro.
* **Sistema Auto-Healing de Snapshots**: Los *Snapshots* (cortes de patrimonio histórico) son inmutables... a menos que haya un error humano. Si el usuario modifica el saldo de una transacción ocurrida hace 8 meses, un trigger algorítmico **recalcula en cascada y atómicamente** todos los Snapshots desde esa fecha hasta el presente, garantizando que el historial del patrimonio neto nunca se corrompa.

### 🎨 Frontend: Renderizado Reactivo y UI Ultra-Premium (React 19 / Vite)
* **Glassmorphism Design System**: Una interfaz oscura de altísima fidelidad visual. Construida con **TailwindCSS**, utiliza capas de desenfoque (`backdrop-blur-md`), bordes redondeados orgánicos, transparencias dinámicas e iconografía premium (`lucide-react`).
* **Micro-Interacciones a 60 FPS**: Impulsado por **Framer Motion**. Cada modal, tarjeta y alerta cuenta con animaciones de entrada/salida matemáticas (springs), persistencia de layouts (`AnimatePresence`) y feedback táctil visual.
* **Tarjetas Virtuales Dinámicas (Smart Cards)**: Los modales de Cuentas y Tarjetas de Crédito renderizan en tiempo real una representación física (tipo Apple Card) que cambia de color, banco, red (Visa/Mastercard) y saldo conforme el usuario teclea.
* **Arquitectura Offline-First con React Query**: Sincronización milimétrica con el backend. Uso de `@tanstack/react-query` para invalidación inteligente de caché. Al editar una cuenta, los gráficos del dashboard, el patrimonio y las listas de transacciones se actualizan instantáneamente sin recargar la página.

---

## 🗺️ Topografía del Sistema: Módulos y Páginas

El ecosistema abarca cada espectro de las finanzas personales mediante módulos interconectados:

### 1. 📊 Dashboard (El Centro de Mando)
El cerebro visual del proyecto. Muestra telemetría financiera en tiempo real mediante `Recharts`:
* **Safe to Spend (Monto Seguro)**: El KPI principal. Cuánto puedes gastar HOY sabiendo que todas tus deudas, presupuestos y suscripciones futuras ya están cubiertas.
* **Proyección de Flujo de Caja**: Gráfico de área predictivo a 30, 60 y 90 días basado en gastos fijos.
* **Patrimonio Neto Histórico (Net Worth)**: Línea de tendencia de tu riqueza total.
* **Widgets Operativos**: Desglose de Gastos (Pie Chart), Gasto Diario (Area Chart), alertas de deudas a vencer (Payment Reminders) y sistema de Deudas Compartidas (IOUs).

### 2. 💸 Transacciones (La Matriz de Datos)
El motor de registro diario.
* **Smart Importer**: Soporte masivo para importar CSVs bancarios, con capacidad para ignorar duplicados criptográficamente.
* **Clasificación Automática**: Asignación rápida de categorías primarias y secundarias (subcategorías).
* **Filtros Avanzados**: Búsquedas componibles por fecha, monto, cuenta, y status de reconciliación.

### 3. 🏦 Cuentas y Tarjetas (Gestión de Capital)
El inventario de tus activos y pasivos.
* **Soporte Multitipo**: Cuentas Checking, Savings, Cash, Credit Card e Investment.
* **Estados de Cuenta (Statements)**: Un módulo anidado exclusivo para Tarjetas de Crédito. Registra la fecha de corte, fecha límite de pago, saldo total, monto abonado y calcula automáticamente la **Porción del Usuario** (aislando compras a meses sin intereses o deudas de terceros).

### 4. 🎯 Presupuestos y Metas (Disciplina)
* **Budgets**: Límites de gasto mensuales por categoría. Barras de progreso dinámicas que cambian de verde a rojo crítico conforme se acerca al límite.
* **Goals**: Metas de ahorro con fechas objetivo. Vincula transacciones específicas a la meta y visualiza el progreso y la velocidad de ahorro requerida.

### 5. 🔄 Suscripciones (Fugas Silenciosas)
* Rastreador automático de pagos recurrentes (Netflix, AWS, Gimnasio).
* Cálculo de costo mensualizado y anualizado para evaluar el impacto a largo plazo de las membresías.

### 6. ☁️ Copias de Seguridad (Cloud Backup & Sync)
Tabula Rasa ahora integra una solución de respaldos soberana sobre Google Drive:
* **Google Drive OAuth2 Native Flow**: Integración directa mediante un flujo manual ultra-robusto que garantiza privacidad absoluta sin intermediarios.
* **Respaldos Automatizados**: Crea copias cifradas de tu base de datos SQLite y las sube automáticamente a tu unidad personal.
* **Gestión de Versiones**: Lista, restaura o elimina copias de seguridad directamente desde el panel de control.
* **Sistema Pre-Restore Safety**: Antes de cada restauración, el sistema crea un backup local preventivo (Rollback) para evitar pérdida de datos accidental.

### 7. ⚙️ Configuración y SRI (Compliance & Settings)
* **Gestor de Base de Datos**: Importación/Exportación cruda de la base de datos en formato JSON para portabilidad absoluta (Data Freedom). Capacidad de "Clean Wipe" para purgar historiales reteniendo configuraciones estructurales.
* **Gestor de Categorías Arborescentes**: Soporte para Parent-Child categories con asignación hexadecimal de color.
* **Reglas Fiscales (SRI)**: Asignación de topes legales deducibles por categoría tributaria ecuatoriana y gestión de llaves API (Gemini).

---

## 🚀 Guía de Instalación Rápida

### Requisitos Previos
* **Python** 3.11+
* **Node.js** 18+
* Una API Key de **Google AI Studio** (con acceso a Gemini 3.1 Flash-Lite)

### 1. Despliegue del Backend
```bash
# 1. Navegar al directorio
cd backend

# 2. Crear y activar entorno virtual
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate

# 3. Instalar motor y dependencias
pip install -r requirements.txt
```
> **Nota de Seguridad Crítica**: Crea un archivo `.env` en la raíz de `/backend` con tus credenciales y reglas fiscales base:
> ```env
> GEMINI_API_KEY=tu_api_key_gemini_3.1_flash_lite
> DATABASE_URL=sqlite:///./finance.db
> IVA_RATE=0.15
> ```

### 2. Despliegue del Frontend
```bash
# 1. Navegar al directorio frontend
cd frontend

# 2. Instalar el ecosistema de dependencias (React, Vite, Tailwind, Framer)
npm install

# 3. Iniciar el servidor de desarrollo ultrarrápido
npm run dev
```

### ⚡ Scripts de Orquestación Automática
Para una experiencia "One-Click", el repositorio incluye scripts de arranque unificado en la raíz que inician tanto el backend (Uvicorn) como el frontend (Vite) en paralelo:
* **Windows**: `./menu.bat` o `./menu.ps1`
* **Linux / MacOS**: `./menu.sh`

---

<div align="center">

<i>Construido con precisión quirúrgica. Pensado para la máxima exigencia analítica. Inquebrantable en su soberanía.</i>

**Tabula Rasa © 2026**

</div>
