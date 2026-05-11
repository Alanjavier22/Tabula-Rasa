## Fecha: 08 de Mayo de 2026 (Sesión Actual)

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
