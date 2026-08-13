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

### 10. CORS/pairing entre dispositivos LAN — verificar en vivo
Esta fase agregó la IP LAN detectada dinámicamente tanto al `ALLOWED_ORIGINS` del middleware de seguridad como al `allow_origins` de CORS en `main.py` (antes solo tenían `localhost`/`127.0.0.1`, lo cual en teoría ya bloqueaba el flujo de pairing QR entre el PC y el celular). No se probó en vivo con un dispositivo real en la LAN — vale la pena confirmar que el pairing por QR sigue funcionando end-to-end después de este cambio.

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

---

## Cómo retomar
Cada ítem es independiente — no hay orden estricto salvo que el punto 11 (auditar qué tan roto está `db/db.ts`) probablemente debería ir antes que invertir tiempo en los servicios que dependen de él.
