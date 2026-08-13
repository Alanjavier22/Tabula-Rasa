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

### 5. Reglas de `react-hooks` del nuevo ruleset (34 ocurrencias: `immutability`, `purity`, `set-state-in-effect`, `exhaustive-deps`)
**Por qué se dejó afuera:** cada una requiere revisión de comportamiento caso por caso (agregar una dependencia a un `useEffect` a ciegas puede causar loops infinitos o refetches de más). No son mecánicas como las que sí se corrigieron en esta fase (unused-vars, ban-ts-comment).
**Archivos con más ocurrencias:** `SentinelBubble.tsx` (5), `TransactionForm.tsx` (2), `StatementImportModal.tsx` (2), `Dashboard.tsx` (4), y un caso suelto en ~20 archivos más (`App.tsx`, `Budgets.tsx`, `Goals.tsx`, `Subscriptions.tsx`, `Settings.tsx`, `Reminders.tsx`, `Categories.tsx`, `Snapshots.tsx`, `PairingPage.tsx`, `IOUWidget.tsx`, `DeferredWidget.tsx`, `SafeToSpendWidget.tsx`, `AuthGuard.tsx`, `DeviceManager.tsx`, `WhatIfModal.tsx`, `AIAnomalyScanner.tsx`, `AIAssistantDrawer.tsx`, `Select.tsx`).
**Correr `npm run lint` en `frontend/` para ver la lista actualizada.**

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

### 12. Datetimes del backend sin sufijo de zona horaria — el frontend los interpreta como hora local — PARCIALMENTE RESUELTO 2026-08-12
El backend serializa datetimes en UTC pero sin `Z`/offset (ej. `"2026-08-13T01:23:17"`). Un ISO string sin zona lo interpreta el navegador como hora **local**, no UTC - en un usuario en Ecuador (UTC-5) esto corrió `device.last_sync` 5 horas hacia el futuro, mostrando "Sinc: en alrededor de 5 horas" en vez de "hace unos segundos" en `DeviceManager.tsx`. Corregido ahí con un helper `parseBackendUTC()` que agrega `Z` si falta antes de pasarlo a `new Date()`.

**El mismo patrón (`new Date(campoDelBackend)` sin ajustar zona) aparece en ~14 lugares más**, sin corregir todavía: `Snapshots.tsx`, `Settings.tsx` (backup.createdTime), `Goals.tsx`, `Subscriptions.tsx` (x3), `Reminders.tsx` (x3), `IOUWidget.tsx`, `Transactions.tsx`, `SentinelBubble.tsx` (health.timestamp - éste sí es sensible a la hora exacta, no solo la fecha), `TransactionForm.tsx`, `FiscalDashboard.tsx` (x2), `DatePicker.tsx`. La mayoría formatea solo la fecha (`toLocaleDateString`) donde el corrimiento de unas horas rara vez cambia el día calendario mostrado, salvo cerca de medianoche - impacto bajo pero real. `SentinelBubble.tsx` sí muestra hora exacta y está igual de afectado que `DeviceManager` lo estaba.
**Sugerencia de abordaje:** en vez de tocar archivo por archivo, lo más robusto es que el backend serialice con offset explícito (Pydantic v2 lo hace solo si el `datetime` conserva `tzinfo`; probablemente se pierde al pasar por SQLite, que no tiene tipo de zona horaria nativo) - un fix ahí arreglaría los ~15 lugares de una sola vez en vez de tocar cada componente.

### 14. Auditoría de rendimiento 2026-08-12 — un fix aplicado, resto queda como deuda arquitectónica
Health check pedido por el usuario ante la duda de si el rendimiento había bajado. Veredicto general: nada roto ni degradado — app personal de un solo usuario sobre SQLite local, así que el margen de estrés es amplio. Un solo punto se corrigió, el resto queda documentado por si se retoma.

**Resuelto:** N+1 en `/metrics/dashboard-summary` (datos del Sankey) — `backend/app/api/metrics.py`, la query de `current_month_txns` hacía lazy-load de `txn.category`, `txn.splits` y `split.category` (uno por transacción del mes). Se agregó `joinedload(Transaction.category)` y `joinedload(Transaction.splits).joinedload(TransactionSplit.category)`. Es el único de los hallazgos que corre en *cada visita al dashboard* (los demás son históricos o esporádicos), de ahí la prioridad. Verificado con pytest (38 passed).

**Pendiente, baja prioridad (impacto real bajo hoy, pero documentado para no re-descubrirlo):**
- **N+1 en `/metrics/net-worth`** (`backend/app/api/metrics.py:153-177`): por cada mes del histórico vuelve a traer todas las transacciones para chequear splits, en vez de una query agregada — el propio archivo ya resuelve esto bien en otro endpoint (líneas ~546-562), así que es inconsistencia interna, no desconocimiento del patrón. Con 12-36 meses de histórico son 12-36 queries extra + una por transacción con split.
- **N+1 en importación de extractos** (`backend/app/services/account_intelligence.py:446`): chequeo de duplicados fila por fila (`db.query(Transaction).filter(fingerprint==...)`) dentro del loop de parseo, en vez de un solo `IN (...)` antes del loop. Solo importa en imports grandes (cientos de filas), flujo esporádico.
- **Llamadas síncronas a Gemini dentro de endpoints `async`** (`backend/app/services/account_intelligence.py:372`, `backend/app/services/statement_intelligence.py:124`, invocadas desde `backend/app/api/intelligence.py:116-147`): `client.models.generate_content(...)` bloquea el event loop de uvicorn mientras responde (puede ser varios segundos, con reintentos hasta 40s en `account_intelligence.py:391-395`) — no usa `run_in_threadpool`/`asyncio.to_thread`. Sin impacto hoy (un solo usuario), pero se notaría como app "colgada" si en algún momento dos dispositivos la usan en simultáneo mientras corre un import con IA. Fix: envolver la llamada en `asyncio.to_thread(...)`.
- **`useMemo` con memoización rota en `Dashboard.tsx`** (líneas ~201-342): varios `results[i].data as X || []` crean un array nuevo en cada render cuando `data` es falsy, invalidando la dependencia de los `useMemo` (`totalBalance`, `latestStatements`, `totalIOUsTheyOwe`) — confirmado por ESLint (`react-hooks/exhaustive-deps`). No causa refetches, solo recómputo de más; cosmético, parte de las 34 violaciones de hooks del ítem 5.

**Confirmado que está bien, no tocar:** code-splitting por ruta ya implementado (`React.lazy`/`Suspense` en `App.tsx:12-23`), dependencias del bundle razonables (`date-fns`, `decimal.js-light`, sin moment/lodash completo), índices de `Transaction`/`TransactionSplit` ya cubren los filtros comunes (fecha, cuenta, categoría, fingerprint).

### 13. Pairing por QR: no existía una imagen QR real, solo texto — RESUELTO 2026-08-12
`DeviceManager.tsx` (botón "Vincular Nuevo") pedía `qr_url` al backend (`/auth/pair/generate`) pero nunca lo renderizaba como imagen QR - solo mostraba la URL como texto plano para tipear a mano. `QRScanner.tsx` sí existe y funciona (consume un QR con la cámara), pero el lado que *genera* el QR para escanear nunca se había construido. Se agregó `<QRCodeSVG value={pairingCode.qr_url} />` (la librería `qrcode.react` ya estaba en `package.json`, sin usar), conservando el texto como alternativa manual.

De paso se encontró un segundo bug independiente: `generate_pairing_code()` en `backend/app/api/auth.py` armaba la URL del QR con el puerto **8000** (resto de una migración de puerto vieja, `api.ts` ya tenía código defensivo para limpiar ese puerto de `localStorage`), cuando el backend corre en **8001** desde hace tiempo - cualquier QR escaneado habría fallado igual aunque se renderizara, porque apuntaba a un puerto sin nada escuchando. Corregido en el mismo commit del fix del puerto.

Pendiente real, no crítico: confirmar con la cámara de un celular escaneando el QR en vivo (el mecanismo ya está verificado por otras vías - ver ítem 10).

---

## Cómo retomar
Cada ítem es independiente — no hay orden estricto salvo que el punto 11 (auditar qué tan roto está `db/db.ts`) probablemente debería ir antes que invertir tiempo en los servicios que dependen de él.
