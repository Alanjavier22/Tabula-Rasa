## Fecha: 30 de Junio de 2026 (Health Check & Optimización)

### Health Check Completo
* **Diagnóstico integral**: Se realizó un health check del proyecto detectando código muerto, dependencias con CVEs, anti-patrones arquitectónicos y archivos residuales.
* **Database corruption detectada y reparada**: `finance.db` estaba corrupta (malformed disk image). Se restauró desde `finance.db.pre_phase1_backup` con integridad verificada (40 transacciones, 4 cuentas, 23 categorías, 8 presupuestos preservados).

### Fase 1 — Limpieza de Código Muerto
* **Eliminado `app/brain/`**: 4 scripts de debug con rutas hardcodeadas obsoletas (`c:\Users\ALAN-BG\CascadeProjects\`).
* **Eliminado `app/api/_deprecated/`**: Carpeta vacía con solo `__pycache__`.
* **Eliminadas 6 DBs vacías residuales**: `app.db`, `database.db`, `database.sqlite3`, `personal_finance.db`, `personal_website.db`, `tabula_rasa.db` (0 bytes).
* **Eliminados archivos legacy**: `legacy_finance.db-shm`, `legacy_finance.db-wal`, `temp.pem`.
* **Rotados logs**: `backend.log` (2.2MB → archivado como `.1`), `backend_error.log` truncado.

### Fase 2 — Dependencias con CVEs
* **`cryptography`**: 41.0.7 → 49.0.0 (CVE-2024-26330).
* **`python-multipart`**: 0.0.6 → 0.0.32 (CVE-2024-53981).
* **`uvicorn[standard]`**: 0.27.0 → 0.49.0.
* **`PyJWT`**: 2.8.0 → 2.13.0.
* **`lucide-react`**: ^1.12.0 → ^0.460.0 (versión 1.x no existía en registry).
* **Venv recreado**: El venv anterior apuntaba a `ALAN-BG` (inexistente). Recreado desde cero con Python 3.12.

### Fase 3 — Optimización Arquitectónica Backend
* **Removido `sys.path.append` de 16 modelos**: Anti-patrón eliminado de `transaction.py`, `account.py`, `asset.py`, `category.py`, `budget.py`, `goal.py`, `reminder.py`, `subscription.py`, `credit_card_statement.py`, `debt_share.py`, `iou.py`, `net_worth_snapshot.py`, `import_log.py`, `category_pattern.py`, `device.py`, `authorized_device.py`, `transaction_split.py`.
* **Sincronizado `DATABASE_URL`**: `database.py` ahora lee `DATABASE_URL` del `.env` como fallback.
* **Corregido `CancelledError` en shutdown**: `asyncio.sleep(0.5)` envuelto en `try/except CancelledError`.
* **Completado `app/models/__init__.py`**: Añadidos `Asset`, `AuthorizedDevice`, `DeferredPayment` al `__all__` y imports.

### Fase 4 — Optimización Frontend
* **Guard defensivo en `App.tsx`**: `snapshots.data?.filter()` con fallback `?? 0` para evitar crash si la API retorna undefined.
* **Build verificado**: `npm run build` pasa sin errores tras actualización de `lucide-react`.

---

## Fecha: 16 de Mayo de 2026 (Sesión Anterior)

### 1. Robustez del Orquestador (DevOps & DX)
* **Actualización Inteligente de Python:** Se rediseñó la función `Test-PythonVersion` para que no solo detecte la ausencia de Python, sino que evalúe la versión instalada. Si es inferior a la **3.12.0** (ej. 3.9.0), el script ofrece e inicia una actualización automática vía `Winget`.
* **Saneamiento de Detección de Node.js:** Se migró la verificación de Node.js al comando nativo `Get-Command`. Esto elimina los errores "CommandNotFoundException" (texto rojo en pantalla) que aparecían antes de intentar la instalación automática.
* **Mecanismo de Refresco de PATH:** Implementación de `Refresh-SessionPath`, una función que intenta actualizar las variables de entorno en la sesión actual de PowerShell tras una instalación exitosa, reduciendo la fricción para el usuario.
* **Validación de Dependencias Silenciosa:** Se optimizó el flujo de inicio para que las verificaciones iniciales sean silenciosas y solo informativas, mejorando la estética del arranque.

---

## Fecha: 08 de Mayo de 2026

### 1. Integridad Financiera y Reconstrucción Histórica
* **Normalización de Tipos de Transacción:** Se migró el campo `transaction_type` de un Enum estricto a un formato de `String` flexible, eliminando errores de sincronización entre el backend y el dashboard. Ahora todas las transacciones se almacenan en minúsculas (`income`/`expense`).
* **Importador Inteligente de Banco Guayaquil:** 
    * Se rediseñó el motor de importación para detectar automáticamente el encabezado en archivos Excel (típicamente fila 11).
    * Implementación de captura de **"Saldo Efectivo"**: El sistema ahora extrae el balance corriente de cada transacción directamente del extracto bancario.
    * Robustez en moneda: Manejo dinámico de separadores de miles y decimales (formato ecuatoriano/europeo `$ 1.234,56`).
* **Sincronización de Net Worth Real (Snapshots):** Se implementó una lógica de reconstrucción que deriva el patrimonio neto mensual del último `running_balance` de cada mes, en lugar de promedios o valores estáticos. Esto restauró la precisión de las gráficas de Enero a Mayo 2026.

### 2. Agente Sentinel y Salud Financiera (FASE 8)
* **Integración del SentinelBubble:** Despliegue de un nuevo componente UI en el Dashboard que muestra el "Health Score" financiero en tiempo real.
* **Sistema de Auditoría de Duplicados Semánticos:** Nueva capacidad del Sentinel para detectar transacciones repetidas no solo por monto, sino por similitud de descripción mediante IA.
* **Clasificador SRI-Ecuador:** Mejora en el motor de categorización para alinear los gastos con las categorías de deducción de impuestos del SRI.

### 3. Saneamiento y Mantenimiento Técnico
* **Depuración de Código de Producción:** Se eliminaron logs de depuración (`print statements`) en los endpoints de transacción, optimizando el rendimiento del backend.
* **Limpieza de Scripts Temporales:** Eliminación masiva de scripts de utilidad y auditoría creados durante la fase de migración, dejando el repositorio raíz libre de archivos innecesarios.
* **Deduplicación Reactivada:** Se restauró la protección de integridad por defecto (`skip_duplicates=True`) tras la carga exitosa de los datos históricos.

### 4. Integración de Pasivos Reales (Tarjetas de Crédito)
* **Reconciliación Total de Deuda:** Se importaron manualmente más de 160 transacciones de las tarjetas **Visa Platinum**, **American Express** y **Titanium Euphoria** (Enero - Abril 2026).
* **Precisión al Centavo:** Se ajustaron los balances iniciales y se gestionaron duplicados legítimos (impuestos digitales), logrando que la deuda en el sistema coincida exactamente con los estados de cuenta bancarios (ej. Visa Platinum en $142.31).
* **Gestión de Diferidos:** El sistema ahora rastrea cuotas mensuales de consumos diferidos, permitiendo una visión clara de la deuda técnica a largo plazo.

### 5. Documentación Maestra y Ecosistema
* **README Enciclopédico:** Creación de un nuevo estándar de documentación con diagramas Mermaid, detalle de arquitectura Local-First y especificaciones técnicas de cada módulo (SRI, Sentinel, Metas, etc.).
* **Transparencia en Git:** Implementación de un historial de commits atómico y descriptivo en español, facilitando la auditoría de cambios en el repositorio.

### 6. Sistema de Inteligencia y Auto-Sanación (Nueva Arquitectura)
* **Statement Intelligence Service:** Despliegue de un motor multimodal (Gemini 2.0 Flash) capaz de parsear estados de cuenta complejos (Visa, Amex, Titanium) con detección de diferidos y tipos de movimiento.
* **Mecanismo de Huella Digital (Fingerprinting):** Implementación de hashes SHA-256 por transacción para garantizar 0% de duplicidad, incluso entre diferentes fuentes de datos. Se protegieron 591 registros históricos existentes.
* **Snapshots Auto-Healing:** Nueva lógica de "Snapshots Obsoletos" (`is_stale`). El sistema ahora detecta cambios en el pasado y recalcula automáticamente el Patrimonio Neto histórico para mantener la integridad contable.
* **Capa de Auditoría de Archivos:** Creación de `ImportLog` para rastrear cada carga de archivo, asegurando que ningún estado de cuenta se procese dos veces (vía file hashing).
* **Protección de Soberanía Humana:** Inclusión del flag `is_manual` que impide que procesos automáticos de IA sobrescriban correcciones manuales realizadas por el usuario.

---

## Fecha: 03 de Mayo de 2026

Este documento registra los esfuerzos de estabilización, refactorización y mejoras implementadas en la arquitectura de Tabula Rasa (App Financiera AI-Driven).

### 1. Estabilización de Base de Datos y Proyecciones (Cash Flow)
* **Corrección de Errores de Proyección (`CashFlowService`):** Se solucionó un error crítico de `500 Internal Server Error` que bloqueaba las proyecciones a 30, 60 y 90 días. El error ocurría al intentar leer el atributo `amount_paid` en los modelos de IOUs, el cual no existía en el diseño nativo.
* **Resolución de "Time-Travel" de Fechas (`offset-naive` vs `offset-aware`):** Se eliminó el conflicto de compatibilidad de fechas en Python donde las comparaciones entre las fechas de facturación guardadas en la base de datos (SQLite) no coincidían con el formato `datetime.now(timezone.utc)`. Ahora los módulos de proyecciones, ajustes estacionales y balance general funcionan en formatos estandarizados (offset-naive).

### 2. Ecosistema de Inteligencia Artificial (Gemini 3.1 Flash)
* **Persistencia de API Keys:** Se refactorizó la lógica en el backend para consultar siempre la tabla `Config` en busca de `GEMINI_API_KEY`. Esto resolvió problemas donde la IA lanzaba un error `400 Bad Request` asegurando que no estaba configurada.
* **Herramientas Retrospectivas Autonómas (`get_monthly_summary`):** Anteriormente la IA solo tenía contexto del flujo de caja "actual y futuro". Se le dotó con una nueva herramienta retrospectiva (`get_monthly_summary`) para que cuando el usuario pregunte por meses pasados ("¿Cómo me fue en abril?"), la IA busque específicamente en las transacciones de ese periodo y emita un reporte preciso.
* **Instrucciones de Sistema Ajustadas:** Se pulió el prompt del Asistente para asegurar que entienda el comportamiento de las herramientas (cuándo ver el pasado, cuándo el presente/futuro, y cuándo consultar balances).
* **Modo "Roast" Calibrado:** Se perfeccionó el comportamiento del Roast para que actúe sobre los hábitos del usuario en lugar de atacar por errores del sistema debido a la falta de contexto.

### 3. Mejoras del Frontend (UX/UI y Renderizado)
* **Incremento de Timeouts:** Se incrementó el timeout global de Axios (`api.ts`) de 15s a 60s, permitiendo que la IA analice largos historiales financieros sin cortar la conexión.
* **Renderizado Avanzado de Markdown:** Se integró exitosamente `react-markdown` y el plugin oficial `@tailwindcss/typography`. Las respuestas del asistente ahora se renderizan con tipografías elegantes, negritas y listas estructuradas (`prose-invert`), mejorando drásticamente la legibilidad de los reportes.
* **Manejo Correcto de Promesas y Cargas:** Se repararon bugs donde los estados de mutaciones (`CommandPalette.tsx`) no leían correctamente la respuesta de la IA en la jerarquía del JSON de retorno.

### 4. Saneamiento de Archivos e Infraestructura
* **Limpieza de Errores:** Erradicación del TypeError en el análisis de Snapshots.
* **Consolidación de Balance Sheet:** Ajustes en los pasivos (Liabilities) para que el balance tome correctamente en cuenta las deudas pendientes sin crashear.
