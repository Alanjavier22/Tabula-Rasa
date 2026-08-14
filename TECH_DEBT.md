# Deuda Técnica Pendiente

Backlog de una fase futura. Generado tras el health check completo de 2026-08-12 (ver commits/cambios de esa fecha para lo que sí se corrigió: CSRF en endpoints localhost, migraciones UUID sin rollback, `AuthorizedDevice` muerto, stub de Dexie huérfano, ciclo de imports `api.ts`/`AICashFlowService`, `maskNames()` en mayúsculas, suite pytest mínima, lint 326→231).

Cada ítem trae contexto suficiente para retomarlo sin tener que redescubrir todo desde cero.

---

## Alta prioridad — COMPLETADO 2026-08-12

Los 3 ítems de esta sección se implementaron y verificaron (ver plan `replicated-purring-bonbon.md`): JWT migrado a cookie httpOnly (`tabula_session`, `SameSite=Lax`, `secure` dinámico), `GOOGLE_DRIVE_REFRESH_TOKEN` cifrado con Fernet (self-healing sobre valores legacy en claro), y suite de tests ampliada de 21 a 37 tests (CRUD de accounts/transactions/categories/budgets + `statement_intelligence.py`). De paso se corrigió un bug real: `PUT /budgets/update-recurring` era inalcanzable por orden de registro de rutas.

Pendiente de esa fase, no automatizable: verificación manual en vivo (pairing QR con celular real en LAN, revocación de dispositivo, inspección de flags de cookie en devtools) — ver ítem 10 más abajo.

---

## Media prioridad

### 4. `any` de TypeScript sin tipar — RESUELTO 2026-08-13 (0 restantes de ~197, `npx eslint src` en 0 `no-explicit-any`)
Se hizo en dos rondas dentro de la misma sesión (109 restantes tras la primera, 0 al cierre de la segunda). Todos los ~35 archivos tocados verificados con `npx tsc --noEmit -p tsconfig.app.json` — **importante:** correr `tsc --noEmit` sin el flag `-p tsconfig.app.json` no chequea nada (el `tsconfig.json` raíz tiene `"files": []` y no se resuelve sin ese flag explícito, exit 0 silencioso) — más `npx eslint`, y pytest del backend (38 passed) cuando el fix tocó un `response_model`.

**Resueltos primero — `api.ts`, `Dashboard.tsx`, `Accounts.tsx`:**
- `services/api.ts` (29→0): ~25 interfaces nuevas en `types/index.ts` con los shapes reales de respuesta, extraídos leyendo los `response_model`/`return` exactos del backend (no adivinados).
- `types/schemas.ts` (5→0): archivo completo (312 líneas, Zod + `Local*`/`Sync*` de la arquitectura Dexie abandonada) resultó huérfano sin un solo importador real — borrado entero (decisión explícita del usuario).
- `pages/Dashboard.tsx` (27→0), `pages/Accounts.tsx` (10→0): tipos reales de `useQueries`, `AxiosError` en los `onError`, `AccountPayload`/`StatementPayload` como tipos de escritura aparte de los de lectura (ver por qué en el patrón de abajo).

**Resueltos en la segunda ronda — `db/db.ts` (21→0), `AIAgentService.ts`+`WhatIfModal.tsx`+`privacy.ts` (14→0), `Transactions.tsx`+`TransactionRow.tsx`+`VirtualTransactionList.tsx` (13→0), `Settings.tsx` (8→0), `AccountImportModal.tsx` (6→0), `AIAnomalyScanner.tsx` (5→0), `StatementImportModal.tsx` (7→0), `FiscalDashboard.tsx` (4→0), `Subscriptions.tsx` (5→0), `Reminders.tsx` (4→0), `DocumentImportModal.tsx` (3→0), `DebtSharesWidget.tsx` (3→0), `Budgets.tsx` (2→0), `AuthGuard.tsx` (2→0), `AIWhatIfSimulator.tsx` (2→0), `AISuggestionsInbox.tsx` (2→0), `App.tsx` (2→0), y 6 archivos con 1 cada uno (`FinancialWarnings.tsx`, `QRScanner.tsx`, `Goals.tsx`, `PairingPage.tsx`, `Snapshots.tsx`, `AIAssistantService.ts`).**

**Patrón repetido — payloads de escritura con `null` explícito:** el backend usa `exclude_unset=True` en varios `Update`/`Create` (`transactions.py`, `accounts.py`, `statements.py`): enviar `null` explícito en un campo opcional lo desvincula, mientras que omitir la key lo deja intacto. Los tipos de lectura (`Account`, `Transaction`, `CreditCardStatement`) no admiten `null` en esos campos porque en lectura, si el dato existe, siempre viene presente. Se resolvió con tipos de escritura dedicados en `types/index.ts` (`AccountPayload`, `StatementPayload`, `TransactionPayload`) que widenan justo los campos clave: `credit_limit`/`statement_day`/`payment_day` (cuentas), `payment_due_date`/`cut_off_date`/`notes` (statements), `category_id`/`account_id`/`goal_id`/`expense_type` (transacciones).

**Patrón repetido — Recharts:** la librería tipa `Tooltip.labelFormatter`/`tickFormatter` como `any` en su propia definición; alcanza con no re-anotar el parámetro (no agregarle `: any` propio) para que el lint quede conforme. Para tooltips custom (`content={<Custom />}`) hace falta pasar la función en vez del elemento (`content={Custom}`), porque JSX exige las props en el sitio de instanciación aunque Recharts las inyecte después por `cloneElement`.

**Bugs reales encontrados al typar (no solo limpieza de lint):**
- `WhatIfModal.tsx`: el mapeo a `WhatIfTransactionInput` leía `txn.category_name`, un campo que `Transaction` nunca tuvo — el contexto de categoría enviado a la IA siempre era `'Uncategorized'`. Corregido a `txn.category?.name`.
- `App.tsx`/`net_worth_snapshots.py`: `NetWorthSnapshotResponse` (backend) nunca serializaba `is_stale`/`is_locked` pese a que el modelo ORM sí tiene esas columnas — el heartbeat de reconciliación automática de snapshots obsoletos en `App.tsx` llevaba tiempo comparando siempre contra `undefined`, es decir nunca disparaba la reconciliación. Agregados al `response_model`.
- `Transaction` (frontend) no tenía el campo `beneficiary` pese a que el backend sí lo serializa (`transactions.py`) — se usaba igual vía `any`, ahora está en el tipo.

**Hallazgos colaterales (código muerto, verificado antes de borrar):**
- `db/db.ts` tenía un re-export muerto de `LocalTransaction` — limpiado al borrar `schemas.ts`.
- `uploadGuayaquilExcel` en `api.ts` llamaba a un endpoint inexistente y sin llamadores — borrado (la función real es `AccountImportModal.tsx` → `intelligenceAPI.uploadAccountDocument()`).
- `pages/Transactions.tsx` tenía un componente `TransactionRow` local (con 2 de sus propios `any`) que nunca se renderizaba — `VirtualTransactionList` ya usa el `TransactionRow` real de `components/transactions/`. Borrado.
- `DeviceManager.tsx`/`Settings.tsx` tenían interfaces locales (`Device`, `BackupFile`) desincronizadas del backend — reemplazadas por los tipos compartidos.
- `AISuggestionsInbox.tsx`: componente sin un solo importador en todo el proyecto, y `AIAgentService.suggestCategorizations()` (la única función que produce su prop `suggestions`) tampoco tiene llamadores — feature de "revisar sugerencias de IA" scaffoldeada de punta a punta (endpoint + servicio + UI) pero nunca conectada a ninguna página. Se tipó igual (no se borró — decidir aparte si vale la pena terminarla o limpiarla).

### 5. Reglas de `react-hooks` del nuevo ruleset (`immutability`, `purity`, `set-state-in-effect`, `exhaustive-deps`) — PARCIALMENTE RESUELTO 2026-08-13

**Resuelto — `immutability` (12 ocurrencias, 0 restantes):** en 9 archivos (`Snapshots.tsx`, `Subscriptions.tsx`, `DeferredWidget.tsx`, `IOUWidget.tsx`, `SafeToSpendWidget.tsx`, `Budgets.tsx`, `Categories.tsx`, `Goals.tsx`, `Reminders.tsx`) el patrón era `useEffect(() => { fetchX(); }, [])` con `const fetchX = ...` declarado *después* del efecto. Es puro reordenamiento de sentencias (mover la función antes del `useEffect`) sin cambio de comportamiento — funcionaba en runtime porque el efecto corre después del render, pero violaba el análisis estático del compiler.

**Resuelto — `purity` (5 ocurrencias, 0 restantes):**
- `SentinelBubble.tsx` — las posiciones/duraciones de las 6 partículas flotantes se generaban con `Math.random()` directo en el JSX del `.map()`, es decir en cada render. Bug real (no solo cosmético del lint): cualquier re-render mientras el panel está abierto (ej. refetch de React Query) hacía que las partículas "saltaran" a posiciones nuevas en vez de animarse continuas. Se movió la generación a un `useMemo(..., [])` (una sola vez al montar). El `Math.random()` en sí sigue siendo "impuro" para el linter aunque esté memoizado (la regla no distingue estabilidad entre renders de determinismo dentro de un render), así que se agregó un bloque `eslint-disable`/`eslint-enable react-hooks/purity` justificado alrededor del `useMemo` — es decoración visual, no necesita determinismo real.
- `AIAnomalyScanner.tsx:65` (`Date.now()` en `handleAddSubscription`) — falso positivo: la llamada está dentro de un `onClick` handler, no del render body: el compiler no distingue el contexto y marca cualquier `Date.now()`/`Math.random()` en el árbol de la función del componente. Se silenció puntualmente con `eslint-disable-next-line` justificado.

**Resuelto — `exhaustive-deps` (6 ocurrencias, 0 restantes):**
- `Dashboard.tsx` (las 4 del ítem 14, ver más abajo): `pendingIOUs`/`accounts`/`statements` se derivaban con `(results[i].data as X[]) || []` — el `|| []` crea un array nuevo en cada render, invalidando los `useMemo` que dependen de ellos (recalculaban siempre en vez de solo cuando cambiaban los datos reales). Se agregó una constante `EMPTY_ARRAY` a nivel de módulo como fallback estable.
- `WhatIfModal.tsx:95` — bug real, no cosmético: `handleSimulateWhatIf` (`useCallback`) usa `monthlyIncome`, `fixedExpenses`, `totalDebt`, `monthlyDebtPayment`, `avgMonthlySpend` y `goals` de las props pero el array de deps solo tenía `[whatIfPrompt, transactions, currentNetWorth]`. Como el componente está envuelto en `React.memo`, si esas props cambiaban después del primer render, el callback memoizado seguía usando los valores viejos (closure obsoleto) — el usuario podía simular un escenario con ingresos/gastos desactualizados. Se agregaron las deps faltantes.
- `StatementImportModal.tsx:58` — el efecto que recalcula `user_share_cents` dependía solo de `statementMetadata?.statement_balance_cents`, no del objeto completo. Se cambió a depender de `statementMetadata` entero; el guard existente (`if (newUserShare !== statementMetadata.user_share_cents)`) ya evita el loop infinito que causaría depender del objeto que el mismo efecto actualiza.

**Pendiente, dejado deliberadamente afuera — `set-state-in-effect` (18 ocurrencias, subió de 9 a 18 al arreglar `immutability` de arriba):** esta regla trata **cualquier** patrón `useEffect(() => { fetchX() }, [])` con `fetchX` async que termina en `setState()` (aun después de un `await`) como anti-patrón de "fetch en efecto" — es la recomendación de React de usar una librería de data-fetching (TanStack Query, SWR) en vez de `useEffect`+`useState` a mano. Es el patrón usado en prácticamente **todas** las páginas de esta app (`App.tsx`, `Settings.tsx`, `TransactionForm.tsx`, `Select.tsx`, `DeviceManager.tsx`, `PairingPage.tsx`, y los mismos 9 archivos de arriba, entre otros) y no es un bug — es fetch-on-mount funcionando correctamente. "Arreglarlo" de verdad implicaría migrar el data-fetching de toda la app a una librería, que es un cambio arquitectónico aparte, no limpieza de lint. Decisión explícita del usuario 2026-08-13: documentar y no tocar por ahora.

**Correr `npm run lint` en `frontend/` para ver el estado actualizado.**

### 6. Archivos "god" que conviene partir — RESUELTO 2026-08-13

**Backend** (`backend/app/`), 6 archivos partidos por dominio/concern:
- `utils/backup.py` (1000L) → `backup_local.py` (checkpoint/rotar/crear/restaurar local) + `backup_gdrive.py` (Google Drive). Actualizados los 3 callers y el test que monkeypatchea `SessionLocal`.
- `api/ai_assistant.py` (904L) → las ~24 tools de solo lectura + su schema de Gemini a `services/ai_assistant_tools.py`; el `if/elif` de 20 ramas del dispatcher se reemplazó por un dict de closures + `inspect.isawaitable`. Router queda en 265L.
- `api/metrics.py` (848L) → `metrics_cashflow.py` + `metrics_balance_sheet.py` + `metrics_dashboard.py`, agregados en `metrics.py` (router delgado). 14 endpoints verificados contra el schema OpenAPI, sin cambios de superficie.
- `api/ai_insights.py` (809L) → las 12 funciones `_build_*_summary` a `services/insights_builders.py`. Router queda en 387L (solo los 2 endpoints que arman el prompt).
- `services/account_intelligence.py` (533L) → `account_statement_parser.py` (heurísticas Pandas sin IA/DB) + `account_import_finalizer.py` (persistencia pura, sin relación con parsing) + `account_intelligence.py` (189L, solo orquestación IA + categorización + dedup).
- `api/ai.py` (510L) → `ai_shared.py` (helpers/modelos compartidos) + `ai_categories.py` + `ai_whatif.py` + `ai_anomalies.py` + `ai_receipts.py`, agregados en `ai.py` (44L). `ai_receipts.py` no se fusionó con `ai_audio.py` pese a compartir prefijo de ruta porque tienen `get_gemini_key` con fallback distinto (uno cae a env var, el otro no) — documentado en el docstring.

**Frontend** (`frontend/src/`), 10 archivos partidos (modales/tabs/widgets extraídos a componentes):
- `pages/Accounts.tsx` (1285L) → `components/accounts/{CreateAccountModal,EditAccountModal,AccountStatementModal,shared}.tsx`. Queda en 594L.
- `pages/Dashboard.tsx` (1119L) → 7 widgets a `components/dashboard/` (AIInsightsSection, PaymentAlertsPanel, DashboardMetricsRow, ExpenseBreakdownChart, IncomeExpenseBarChart, DailySpendingChart, NetWorthChart, CashFlowForecastChart). Queda en 592L. Verificado visualmente con Playwright contra el dev server real.
- `pages/Settings.tsx` (931L) → `components/Settings/{GeneralTab,AITab,LabsTab,CloudTab,types}.tsx` (Security tab ya era solo `<DeviceManager />`). Verificado visualmente: las 5 pestañas renderizan con datos reales.
- `pages/Budgets.tsx` (797L) → `components/budgets/BudgetFormModal.tsx` (crear/editar/recurrente en un wrapper). El modal de "pago" ya delegaba en `TransactionForm` existente.
- `pages/Goals.tsx` (652L) → `components/goals/GoalFormModal.tsx`.
- `pages/Reminders.tsx` (650L) → `components/reminders/ReminderFormModal.tsx`.
- `pages/Subscriptions.tsx` (632L) → `components/subscriptions/SubscriptionFormModal.tsx`.
- `pages/Categories.tsx` (606L) → `components/categories/CategoryFormModal.tsx` (reusado para crear/editar vía prop `isCreate`). Al extraer se encontraron clases Tailwind construidas dinámicamente (`bg-${accentColor}-500/10`) que el JIT scanner no detecta — corregido a strings de clase completos, verificado visualmente que el color se aplica.
- `pages/Transactions.tsx` (588L) → `hooks/useAudioTransactionCapture.ts` (grabación de voz + envío a Gemini).
- `components/StatementImportModal.tsx` (639L) → partido parcialmente a propósito: `components/statementImport/{StatementUploadStep,ShareTransactionModal}.tsx` (piezas autocontenidas de bajo riesgo). El paso de auditoría/revisión (tabla de transacciones + metadata, ~260L) se dejó intacto por ser la parte de mayor complejidad y mayor impacto si algo sale mal en el import de estados de cuenta reales. Queda en 550L.

**`services/ReportingService.ts`** ya no aparecía en el listado original al momento de retomar este ítem — bajó a 36 líneas en una refactorización previa, no era candidato.

Verificación aplicada a cada archivo: `tsc --noEmit -p tsconfig.app.json` + `eslint` (frontend, 0 errores nuevos — línea base de 18 `react-hooks/set-state-in-effect` diferidos sin cambio) / `pytest` (backend, 38 passed) tras cada corte, más verificación visual con Playwright contra el dev server real (con datos reales, sin mocks) para Accounts, Dashboard, Settings, Budgets, Categories y StatementImportModal — incluyó atrapar y corregir un bug real introducido durante el propio refactor (un `</div>` de más en Dashboard.tsx que rompía el árbol JSX) antes de commitear.

### 7. Boilerplate CRUD duplicado — RESUELTO (revisión completa) 2026-08-13
Se agregó `backend/app/api/crud_factory.py` (`make_crud_router`), que genera POST/GET/GET-by-id/PUT/[DELETE] con hooks (`pre_create`, `pre_update`, `before_id_routes` para rutas estáticas que deben registrarse antes de `/{id}`). Migrados a usarlo: `accounts.py`, `categories.py`, `reminders.py`, `subscriptions.py`, `ious.py`, `transaction_splits.py` (6 de 32 módulos) — cada uno conserva sus endpoints extra (`set-balance`, `export`/`import`, `pay`, `settle`, `batch`, etc.) sobre el router devuelto por el factory. `transaction_splits.py` es el ejemplo de que `pre_create`/`pre_update` alcanzan incluso cuando el create/update tiene validaciones de negocio (categoría existe, suma de splits no excede el monto de la transacción) — no hace falta que sea 100% mecánico para migrar, solo que la lógica quepa en esos hooks.

**Deliberadamente no migrados**, porque el delete/list tiene lógica de negocio no trivial y forzarlos al factory sería sobre-ingeniería: `goals.py` (delete con reembolso + desvinculación de transacciones), `budgets.py` (ya tiene su propio orden de rutas documentado, ver comentario en el archivo).

**Revisados y descartados en la ronda del 2026-08-12** (no son candidatos limpios, no vale la pena forzarlos):
- `deferred.py` — no tiene endpoint PUT; migrarlo agregaría un endpoint que nunca existió, cambiando la superficie de la API sin que nadie lo pidiera.
- `net_worth_snapshots.py` — el create usa `POST /create` en vez de `POST /` (el factory asume `/`), y la mayoría de sus endpoints son de negocio no-CRUD (`analyze`, `reconcile`, `lock`), no un CRUD simple.
- `alerts.py` — no es CRUD, es un único `GET /payment-reminders`.

**Revisados en la ronda del 2026-08-13 (resto de los ~23 módulos, uno por uno):** de todos los que quedaban, solo tres tenían la forma superficial de CRUD completo (`POST /`, `GET /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`) — el resto (`dependencies.py`, `maintenance.py`, `ai_audit.py`, `export.py`, `intelligence.py`, `fiscal.py`, `ai_audio.py`, `ai_vision.py`, `ai_assistant.py`, `ai_goals.py`, `ai_insights.py`, `ai_sentinel.py`, `ai.py`, `backup.py`, `auth.py`, `metrics.py`) son endpoints de solo lectura, de negocio, o de autenticación/pairing — ni siquiera candidatos superficiales, se descartan sin análisis caso a caso. Los tres con forma de CRUD, descartados por razón concreta:
- `transactions.py` — create/update/delete delegan en `create_transaction_with_splits`/`update_transaction_with_splits`/`delete_transaction_with_balance` (`services/transaction_service.py`), que manejan splits y recálculo de saldo de cuenta como efectos secundarios. El factory asume `model(**payload.model_dump())` + commit directo; forzar este flujo a `pre_create`/`pre_update` significaría duplicar esa orquestación fuera del factory, no ahorrar código. El `GET /` además tiene filtro (`transaction_type`) y orden (`date desc`) custom con `limit` default de 10000 (vs. 100 del factory).
- `statements.py` — dos problemas: (1) la serialización usa `serialize_statement()` a mano (dict plano, no `from_attributes`) porque necesita convertir enums (`status.value`) y anidar `debt_shares`, algo que el `response_model` directo del factory no resuelve sin un `model_validator` custom; (2) `POST /` crea el `CreditCardStatement` *y* sus `DebtShare` anidados en la misma transacción, y `PUT`/`POST` parsean fechas con `parse_date_robustly()` antes de asignar — lógica de negocio real, no boilerplate mecánico. El sub-recurso `shares` (`POST /{id}/shares`, `PUT /shares/{id}`, `DELETE /shares/{id}`) tampoco es candidato aparte: no tiene `GET /shares` ni `GET /shares/{id}`, CRUD incompleto por diseño (solo se accede a través del statement padre).
- `config.py` — el lookup en `GET/PUT/DELETE /{config_key}` es por el campo `key`, no por `id` (el factory asume siempre `model.id == item_id`). Además `POST /` valida que la key no exista (`pre_create` lo resolvería bien) pero `GET /`/`GET /{key}` enmascaran `value` cuando `is_public` es falso (`"********"`) — lógica de serialización condicional que el `response_model` plano del factory no expresa sin un validator custom. Mismo patrón de mismatch que ya descartó a `net_worth_snapshots.py` (ruta no estándar) sumado al de `statements.py` (serialización custom).

**Conclusión de la revisión:** de los 32 módulos de `app/api/`, 6 están migrados al factory y ninguno de los ~23 restantes es candidato limpio — los que no son CRUD ni se acercan (17), y los 3 que superficialmente parecen CRUD tienen cada uno una razón estructural concreta para no encajar (orquestación de servicio externa, serialización custom con enums/anidado, o lookup por campo no-`id`). El factory sigue disponible para módulos *nuevos* que se escriban desde cero con esa forma exacta — no hay más trabajo de migración pendiente sobre el código existente.

---

## Baja prioridad / cosas menores encontradas en el camino

### 8. `_match_card_by_name` puede dar falsos positivos con palabras genéricas — RESUELTO 2026-08-12
**Dónde:** `backend/app/services/credit_card_payment.py:66-78`. Se agregó `_GENERIC_CARD_NAME_WORDS` (palabras de banca/pago comunes en español) excluida del matcheo por palabra suelta, así "PAGO TARJETA" ya no matchea una tarjeta llamada "Tarjeta A" solo por la palabra "TARJETA" — el match por nombre completo sigue funcionando igual. Cubierto por `test_match_card_by_name_ignores_generic_words` en `backend/tests/test_credit_card_payment.py`.

### 9. Archivos y carpetas residuo acumulados — RESUELTO 2026-08-13
Auditoría de todo el árbol del proyecto (no solo `finance.db.*`) buscando residuos. Todo lo encontrado estaba gitignorado (no era problema de repo, solo clutter en disco). Borrado con confirmación explícita del usuario:
- Backups viejos de `finance.db`: `.backup`, `.pre_phase1_backup`, `.pre_uuid_migration` (29-abr, de migraciones ya cerradas) y `.pre_healthcheck_backup_20260812_102027` (del health check ya verificado completo).
- `backend/backups/`: 3 backups manuales/de restore (`current_before_restore_20260505_223116.db`, `tabula_rasa_backup_20260513_203707.sqlite3`, `tabula_rasa_backup_20260516_103039.sqlite3`).
- `./temp_uploads/` en la raíz del proyecto — carpeta vacía, duplicada de `backend/temp_uploads/`.
- `backend/temp_uploads/ddf9aa61-....pdf` — PDF huérfano de una subida del 13-may nunca limpiada tras procesarse.
- `backend/temp_restore/` — vacía, resto de una operación de restore pasada.
- `backend/__pycache__/`, `backend/scripts/__pycache__/`, `.pytest_cache/` (raíz), `backend/.pytest_cache/` — cache regenerable.

**Logs en dos ubicaciones — investigado 2026-08-13, no es deuda:** `backend/backend.log` y los 4 de la raíz (`backend.log`, `backend_error.log`, `frontend.log`, `frontend_error.log`) son dos mecanismos de logging distintos e intencionales, no una duplicación accidental:
- `backend/backend.log`: `RotatingFileHandler` de Python configurado en `setup_logging()` (`backend/main.py:95-132`), path fijo a `os.path.dirname(__file__)` (siempre `backend/`, sin importar desde dónde se lance el proceso). Rotación real (10MB × 5 backups). Es el log persistente de la app, sobrevive entre reinicios. Efecto colateral menor sin impacto: como `TestClient` de pytest importa `main.py`, las corridas de tests también escriben ahí (ruido, no bug).
- Los 4 de la raíz: los define `menu.ps1:13-16` y los llena `Start-Process -RedirectStandardOutput/-RedirectStandardError` (líneas 542 y 585) al lanzar uvicorn y `npm run dev` — captura cruda de stdout/stderr de la sesión. `menu.ps1:448-451` los limpia (`Clear-Content`) antes de cada arranque, así que son efímeros por diseño. `menu.ps1:565` los usa para mostrar las últimas líneas de `backend_error.log` si el arranque falla — es la herramienta de diagnóstico rápido del menú.

Conclusión: nada que corregir, cada uno cumple un propósito distinto (log persistente rotado vs. captura efímera de sesión para troubleshooting).

### 10. CORS/pairing entre dispositivos LAN — RESUELTO 2026-08-12
El usuario vinculó un segundo dispositivo real (Android) contra el host en la misma LAN ingresando la URL + PIN a mano. La cookie de sesión httpOnly quedó seteada y el dispositivo aparece activo en `/auth/devices`, confirmando que CORS + `ALLOWED_ORIGINS` con la IP LAN dinámica funcionan end-to-end. El ítem 13 (no había imagen QR real para escanear) también se resolvió en la misma sesión, y de paso se encontró y corrigió un bug independiente que hacía que el QR, aun renderizado, apuntara a un puerto muerto (ver ítem 13).

Bugs reales encontrados y corregidos en el camino (no estaban probados hasta esta verificación en vivo):
- El interceptor de `api.ts` trataba cualquier 401/403 (incluido el chequeo esperado de `/auth/me` sin sesión todavía) como "sesión inválida" y forzaba un `window.location.href` - en el dispositivo host esto generaba un loop infinito de recargas apenas se abría la página, porque el auto-pairing nunca llegaba a correr antes del primer reload. Se excluyó `/auth/me` y `/auth/pair/*` de esa lógica.
- `AuthGuard.tsx`/`api.ts` apuntaban el auto-pairing del host a `127.0.0.1:8001` fijo, sin importar si la página se servía desde `localhost:5173`. Con cookie `SameSite=Lax` eso son dos orígenes distintos para el navegador - la cookie seteada en el pairing nunca volvía en los requests siguientes hechos a `localhost`. Ahora ambos usan `window.location.hostname` dinámico.
- `menu.ps1` dejaba procesos zombie de sesiones anteriores compitiendo por el puerto 8001, sirviendo código viejo pese a reiniciar - ver commit de `Stop-SpecificPorts`.

Pendiente real, no crítico: probar en vivo que la cámara escanea el QR nuevo end-to-end (el mecanismo ya está verificado - URL correcta + pairing manual funcionando -, falta solo la confirmación visual de "apunto la cámara y funciona"), y revocación de dispositivo en vivo.

### 11. `db/db.ts` (stub de Dexie) — AUDITADO Y RESUELTO 2026-08-12
Auditoría completa de los servicios que dependían de `db/db.ts`. Resultado: ninguno causaba "datos vacíos silenciosos" visibles hoy porque ninguno se ejecutaba - eran código 100% huérfano (nada en `pages/` ni `components/` los importaba), restos de una arquitectura offline-first con IndexedDB + cola de sincronización que el proyecto abandonó a favor del backend FastAPI como fuente de verdad.

**Borrados (reemplazados por una función real que ya funciona vía backend, o sin ningún llamador):**
- `SnapshotService.ts` → reemplazado por `Snapshots.tsx` + `snapshotsAPI` (backend `net_worth_snapshots.py`)
- `RecurringTransactionService.ts` → reemplazado por el botón "Pagar" de `Subscriptions.tsx` (`subscriptionsAPI.pay()`)
- `ScheduledBackupService.ts` → reemplazado por el backup real a Google Drive en `Settings.tsx` (`backupAPI`)
- `SmartImporter.ts` → reemplazado por `transactions/import-batch` + `statement_intelligence.py` (importador con IA)
- `IntegrityService.ts` → lo esencial (sanar balances) ya lo cubre el botón "Integridad" del Dashboard (`maintenanceAPI.healBalances()`); los chequeos extra (ecuación contable, IOUs huérfanos) no existen en el backend y no se reconstruyeron
- `SearchService.ts` → sin backend ni UI de búsqueda en ningún lado (huérfano completo, nunca se conectó una search bar)
- `CurrencyService.ts` → sin tabla `exchange_rates` ni selector de moneda real en el backend/UI (el campo `currency` del form de cuentas está hardcodeado a USD)
- `DataHydrationOverlay.tsx` → diseñado para el patrón "hidratar desde IndexedDB al iniciar", que ya no aplica (cada página trae datos en vivo con React Query)
- `AIAssistantDrawer.tsx` → reemplazado por `CommandPalette.tsx` (Ctrl+K, montado en `Layout.tsx`), que ya es un chat de IA real contra `ai_assistant.py`. Se limpiaron de paso los métodos muertos de `ReportingService.ts` que sólo este componente llamaba (`prepareAuditContext`, `getTransactionsWithCategories`, `generateReport`, `getTrendData`, `getEstablishmentIntelligence`, `filterTransactions`, `aggregateTransactions`, `createTransactionOptimistic`, `updateTransactionOptimistic`, `deleteTransactionOptimistic`, `getPendingMutationCount`, `bulkUpdateTransactions`, `sanitizeForAI`, `hydrateAIResponse`, `clearHydrationMap`) - se conservó únicamente `setFiscalRules`, que sí usa `Dashboard.tsx` y no depende del stub.

**Conservado, pendiente de construir como feature real:**
- `VehicleService.ts` — el usuario confirmó que control de gastos de vehículo (combustible/mantenimiento) sí es una función que quiere. No existe ningún modelo (`Vehicle`/`FuelLog`/`MaintenanceLog`) en `backend/app/models/`, ni endpoints, ni página en el frontend - el archivo actual depende 100% del stub y no tiene ningún llamador real hoy, pero no se borra porque la intención es diseñarlo de cero (modelo + migraciones + endpoints + UI) en una sesión dedicada, no reparar el archivo existente.

`db/db.ts` en sí se mantiene (lo siguen usando `VehicleService.ts` y `GlobalErrorBoundary.tsx`, este último de forma sana vía `phoenixHardReset`).

### 12. Datetimes del backend sin sufijo de zona horaria — el frontend los interpreta como hora local — RESUELTO 2026-08-13
El backend serializaba datetimes en UTC pero sin `Z`/offset (ej. `"2026-08-13T01:23:17"`). Un ISO string sin zona lo interpreta el navegador como hora **local**, no UTC - en un usuario en Ecuador (UTC-5) esto corría `device.last_sync` 5 horas hacia el futuro, mostrando "Sinc: en alrededor de 5 horas" en vez de "hace unos segundos" en `DeviceManager.tsx` (ya tenía un parche puntual con `parseBackendUTC()`, que se dejó intacto - queda como no-op defensivo ahora que el backend manda offset).

Causa raíz confirmada: SQLite no tiene tipo de dato con zona horaria, así que SQLAlchemy devuelve los `DateTime` **naive** al leerlos de la DB, aunque se hayan escrito con `datetime.now(timezone.utc)`. Pydantic v2 solo agrega el offset (`+00:00`) al serializar si el `datetime` conserva `tzinfo` - con el valor naive, no lo hacía.

**Fix aplicado en un solo lugar** (`backend/database.py`): un listener global `@event.listens_for(Mapper, "load")` (sin `propagate=True` - con `propagate=True` explota con `TypeError: ClassManager.subclass_managers() missing 1 required positional argument` en SQLAlchemy 2.0.49, aparente bug de esa versión; sin propagate el listener ya cubre todos los mappers porque se registra sobre la clase `Mapper` misma, no sobre una clase mapeada puntual) que, apenas se carga cualquier fila de cualquier modelo, recorre sus columnas `DateTime` y les adjunta `tzinfo=UTC` si vienen naive. Usa `set_committed_value()` (no `setattr()` directo) para no marcar el atributo como modificado - evita un `UPDATE` espurio o que se dispare `onupdate` en el próximo commit solo por haber leído la fila.

Con esto, los ~15 lugares del frontend que hacían `new Date(campoDelBackend)` sin ajustar zona (`Snapshots.tsx`, `Settings.tsx`, `Goals.tsx`, `Subscriptions.tsx`, `Reminders.tsx`, `IOUWidget.tsx`, `Transactions.tsx`, `TransactionForm.tsx`, `FiscalDashboard.tsx`, `DatePicker.tsx`) quedan corregidos automáticamente sin tocar el frontend, porque ahora reciben el offset explícito en el JSON. `SentinelBubble.tsx` (health.timestamp) no estaba afectado por esta causa raíz - ese valor se genera con `datetime.now(timezone.utc).isoformat()` en memoria (`sentinel_service.py`), no viaja por la DB, así que ya incluía offset.

Verificado: objeto ORM cargado con `tzinfo=UTC` y `.isoformat()` con offset, `db.is_modified()` en `False` tras la coerción (no queda dirty), y suite completa de pytest (38 passed) sin regresiones.

### 14. Auditoría de rendimiento 2026-08-12 — un fix aplicado, resto queda como deuda arquitectónica
Health check pedido por el usuario ante la duda de si el rendimiento había bajado. Veredicto general: nada roto ni degradado — app personal de un solo usuario sobre SQLite local, así que el margen de estrés es amplio. Un solo punto se corrigió, el resto queda documentado por si se retoma.

**Resuelto:** N+1 en `/metrics/dashboard-summary` (datos del Sankey) — `backend/app/api/metrics.py`, la query de `current_month_txns` hacía lazy-load de `txn.category`, `txn.splits` y `split.category` (uno por transacción del mes). Se agregó `joinedload(Transaction.category)` y `joinedload(Transaction.splits).joinedload(TransactionSplit.category)`. Es el único de los hallazgos que corre en *cada visita al dashboard* (los demás son históricos o esporádicos), de ahí la prioridad. Verificado con pytest (38 passed).

**Resuelto 2026-08-13:**
- **N+1 en `/metrics/net-worth`** (`backend/app/api/metrics.py`, era líneas 153-177): reemplazado por el mismo patrón "simple + split" en agregación SQL que ya usaba `dashboard-summary` (sumar en una query las transacciones sin splits, en otra las que sí tienen split uniendo `TransactionSplit`, combinar en Python por mes). Verificado contra la lógica anterior con datos reales de la DB de dev: 0 discrepancias en los 4 meses de histórico existentes.
- **N+1 en importación de extractos** (`backend/app/services/account_intelligence.py`, era línea 446): el chequeo de duplicados fila por fila dentro del loop de parseo se reemplazó por juntar todos los fingerprints primero y hacer un solo `db.query(Transaction.fingerprint).filter(Transaction.fingerprint.in_(...))` después del loop. Verificado con datos reales: mismo resultado que el chequeo uno-por-uno.
- **Llamadas síncronas a Gemini dentro de endpoints `async`** (`backend/app/services/account_intelligence.py:372`, `backend/app/services/statement_intelligence.py:124`): ambas llamadas a `client.models.generate_content(...)` ahora van envueltas en `await asyncio.to_thread(...)` para no bloquear el event loop de uvicorn mientras responden (hasta 40s con reintentos). El caller (`backend/app/api/intelligence.py:116-147`) ya era `async`/`await` de punta a punta, así que no requirió cambios.

Verificado con pytest (38 passed, sin regresiones).

**`useMemo` con memoización rota en `Dashboard.tsx` — RESUELTO 2026-08-13** (ver ítem 5): `results[i].data as X || []` creaba un array nuevo en cada render cuando `data` era falsy, invalidando la dependencia de los `useMemo` (`totalBalance`, `latestStatements`, `totalIOUsTheyOwe`). Se agregó una constante `EMPTY_ARRAY` estable a nivel de módulo como fallback.

**Confirmado que está bien, no tocar:** code-splitting por ruta ya implementado (`React.lazy`/`Suspense` en `App.tsx:12-23`), dependencias del bundle razonables (`date-fns`, `decimal.js-light`, sin moment/lodash completo), índices de `Transaction`/`TransactionSplit` ya cubren los filtros comunes (fecha, cuenta, categoría, fingerprint).

### 13. Pairing por QR: no existía una imagen QR real, solo texto — RESUELTO 2026-08-12
`DeviceManager.tsx` (botón "Vincular Nuevo") pedía `qr_url` al backend (`/auth/pair/generate`) pero nunca lo renderizaba como imagen QR - solo mostraba la URL como texto plano para tipear a mano. `QRScanner.tsx` sí existe y funciona (consume un QR con la cámara), pero el lado que *genera* el QR para escanear nunca se había construido. Se agregó `<QRCodeSVG value={pairingCode.qr_url} />` (la librería `qrcode.react` ya estaba en `package.json`, sin usar), conservando el texto como alternativa manual.

De paso se encontró un segundo bug independiente: `generate_pairing_code()` en `backend/app/api/auth.py` armaba la URL del QR con el puerto **8000** (resto de una migración de puerto vieja, `api.ts` ya tenía código defensivo para limpiar ese puerto de `localStorage`), cuando el backend corre en **8001** desde hace tiempo - cualquier QR escaneado habría fallado igual aunque se renderizara, porque apuntaba a un puerto sin nada escuchando. Corregido en el mismo commit del fix del puerto.

Pendiente real, no crítico: confirmar con la cámara de un celular escaneando el QR en vivo (el mecanismo ya está verificado por otras vías - ver ítem 10).

### 15. Rutas de IA duplicadas e inalcanzables: `/api/ai/audio-to-txns` y `/api/ai/parse-receipt` — RESUELTO 2026-08-13
Tanto `ai.py` como `ai_audio.py`/`ai_vision.py` registraban un handler para `POST /api/ai/audio-to-txns` y `POST /api/ai/parse-receipt` bajo el mismo prefix. `main.py` incluía `ai.router` antes que `ai_audio.router`/`ai_vision.router`, y FastAPI resuelve por orden de registro (primer match gana) — los handlers de `ai_audio.py` (`AudioToTransactionsResponse`, con `raw_transcript`) y `ai_vision.py` (`ReceiptParseResponse`, con `merchant`, `total_amount`, `splits`, `confidence`) para esas dos rutas específicas nunca se ejecutaban. Confirmado que no era un bug activo: el frontend ya estaba escrito contra el shape simple que sí respondía (`ai.py`, `{transactions: [...]}`).

**Decisión del usuario 2026-08-13: borrar el código muerto** (no vale la pena el esfuerzo de exponer los schemas más ricos sin un pedido de producto real detrás).
- `ai_vision.py` se borró entero: su único endpoint era ese `parse-receipt` inalcanzable, sin nada más en el archivo. Se sacó su import y `app.include_router(ai_vision.router)` de `main.py`.
- `ai_audio.py` conservó el archivo — `document-to-txns` y `batch-category-mapping` son endpoints reales y en uso (`api.ts`), y ambos reusan `TransactionSuggestion`/`AudioToTransactionsResponse`/`sanitize_pii`. Se borró únicamente la función `audio_to_transactions` (handler muerto de `/audio-to-txns`), dejando el resto intacto.

Verificado con pytest (38 passed, sin regresiones).

---

## Cómo retomar
Cada ítem es independiente — no hay orden estricto salvo que el punto 11 (auditar qué tan roto está `db/db.ts`) probablemente debería ir antes que invertir tiempo en los servicios que dependen de él.
