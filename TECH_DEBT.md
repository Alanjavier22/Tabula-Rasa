# Deuda Técnica Pendiente

Backlog de una fase futura. Generado tras el health check completo de 2026-08-12 (ver commits/cambios de esa fecha para lo que sí se corrigió: CSRF en endpoints localhost, migraciones UUID sin rollback, `AuthorizedDevice` muerto, stub de Dexie huérfano, ciclo de imports `api.ts`/`AICashFlowService`, `maskNames()` en mayúsculas, suite pytest mínima, lint 326→231).

Cada ítem trae contexto suficiente para retomarlo sin tener que redescubrir todo desde cero.

---

## Alta prioridad — COMPLETADO 2026-08-12

Los 3 ítems de esta sección se implementaron y verificaron (ver plan `replicated-purring-bonbon.md`): JWT migrado a cookie httpOnly (`tabula_session`, `SameSite=Lax`, `secure` dinámico), `GOOGLE_DRIVE_REFRESH_TOKEN` cifrado con Fernet (self-healing sobre valores legacy en claro), y suite de tests ampliada de 21 a 37 tests (CRUD de accounts/transactions/categories/budgets + `statement_intelligence.py`). De paso se corrigió un bug real: `PUT /budgets/update-recurring` era inalcanzable por orden de registro de rutas.

Pendiente de esa fase, no automatizable: verificación manual en vivo (pairing QR con celular real en LAN, revocación de dispositivo, inspección de flags de cookie en devtools) — ver ítem 10 más abajo.

---

## Media prioridad

### 4. `any` de TypeScript sin tipar (197 ocurrencias)
**Por qué se dejó afuera:** requiere modelar tipos reales (formas de respuesta de la API, props de eventos) archivo por archivo — no es mecánico, alto riesgo de hacerlo mal a las apuradas.
**Peores archivos** (al momento de este corte):
- `frontend/src/services/api.ts` — ~30+ usos, la mayoría en firmas de respuesta (`api.get<any>(...)`)
- `frontend/src/pages/Dashboard.tsx` — ~26 usos
- `frontend/src/pages/Accounts.tsx` — ~10 usos
- `frontend/src/types/schemas.ts` — varios en los schemas Zod
**Sugerencia de abordaje:** empezar por `api.ts` (define los tipos de respuesta reales una sola vez, todo lo demás los hereda), después las páginas que más lo usan.

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

### 6. Archivos "god" que conviene partir
**Backend** (`backend/app/`): `utils/backup.py` (992 líneas), `api/metrics.py` (840), `api/ai_insights.py` (809), `services/account_intelligence.py` (525), `api/ai.py` (507), `api/ai_assistant.py` (904 — router + ~20 schemas de tools de Gemini + dispatcher de 20 ramas, todo en un solo archivo).
**Frontend** (`frontend/src/`): `pages/Accounts.tsx` (1263), `pages/Dashboard.tsx` (1097), `pages/Settings.tsx` (937), `pages/Budgets.tsx` (792), `services/ReportingService.ts` (759), `pages/Goals.tsx` (651), `pages/Reminders.tsx` (643), `pages/Subscriptions.tsx` (628), `pages/Transactions.tsx` (626), `components/StatementImportModal.tsx` (615), `pages/Categories.tsx` (606).

### 7. Boilerplate CRUD duplicado — PARCIALMENTE RESUELTO 2026-08-12
Se agregó `backend/app/api/crud_factory.py` (`make_crud_router`), que genera POST/GET/GET-by-id/PUT/[DELETE] con hooks (`pre_create`, `pre_update`, `before_id_routes` para rutas estáticas que deben registrarse antes de `/{id}`). Migrados a usarlo: `accounts.py`, `categories.py`, `reminders.py`, `subscriptions.py`, `ious.py`, `transaction_splits.py` (6 de 32 módulos) — cada uno conserva sus endpoints extra (`set-balance`, `export`/`import`, `pay`, `settle`, `batch`, etc.) sobre el router devuelto por el factory. `transaction_splits.py` es el ejemplo de que `pre_create`/`pre_update` alcanzan incluso cuando el create/update tiene validaciones de negocio (categoría existe, suma de splits no excede el monto de la transacción) — no hace falta que sea 100% mecánico para migrar, solo que la lógica quepa en esos hooks.

**Deliberadamente no migrados**, porque el delete/list tiene lógica de negocio no trivial y forzarlos al factory sería sobre-ingeniería: `goals.py` (delete con reembolso + desvinculación de transacciones), `budgets.py` (ya tiene su propio orden de rutas documentado, ver comentario en el archivo).

**Revisados y descartados en la ronda del 2026-08-12** (no son candidatos limpios, no vale la pena forzarlos):
- `deferred.py` — no tiene endpoint PUT; migrarlo agregaría un endpoint que nunca existió, cambiando la superficie de la API sin que nadie lo pidiera.
- `net_worth_snapshots.py` — el create usa `POST /create` en vez de `POST /` (el factory asume `/`), y la mayoría de sus endpoints son de negocio no-CRUD (`analyze`, `reconcile`, `lock`), no un CRUD simple.
- `alerts.py` — no es CRUD, es un único `GET /payment-reminders`.

El resto de los ~23 módulos no se revisó módulo por módulo en esta ronda. El factory queda disponible para adoptarlo oportunistamente cuando se toquen esos archivos por otra razón — antes de migrar cualquiera, chequear que tenga create/list/get/update/delete reales sobre `/` y `/{id}` (si falta alguno, no forzarlo).

---

## Baja prioridad / cosas menores encontradas en el camino

### 8. `_match_card_by_name` puede dar falsos positivos con palabras genéricas — RESUELTO 2026-08-12
**Dónde:** `backend/app/services/credit_card_payment.py:66-78`. Se agregó `_GENERIC_CARD_NAME_WORDS` (palabras de banca/pago comunes en español) excluida del matcheo por palabra suelta, así "PAGO TARJETA" ya no matchea una tarjeta llamada "Tarjeta A" solo por la palabra "TARJETA" — el match por nombre completo sigue funcionando igual. Cubierto por `test_match_card_by_name_ignores_generic_words` en `backend/tests/test_credit_card_payment.py`.

### 9. Archivos de backup de `finance.db` acumulados
`backend/finance.db.backup`, `.pre_phase1_backup`, `.pre_uuid_migration` (+ el nuevo `.pre_healthcheck_backup_<fecha>` de esta sesión). Todos gitignorados, no es un problema de repo, solo clutter en disco si se quiere limpiar a mano.

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

---

## Cómo retomar
Cada ítem es independiente — no hay orden estricto salvo que el punto 11 (auditar qué tan roto está `db/db.ts`) probablemente debería ir antes que invertir tiempo en los servicios que dependen de él.
