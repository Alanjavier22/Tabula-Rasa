# Deuda Técnica Pendiente

Backlog de una fase futura. Generado tras el health check completo de 2026-08-12 (ver commits/cambios de esa fecha para lo que sí se corrigió: CSRF en endpoints localhost, migraciones UUID sin rollback, `AuthorizedDevice` muerto, stub de Dexie huérfano, ciclo de imports `api.ts`/`AICashFlowService`, `maskNames()` en mayúsculas, suite pytest mínima, lint 326→231).

Cada ítem trae contexto suficiente para retomarlo sin tener que redescubrir todo desde cero.

---

## Alta prioridad

### 1. Migrar JWT de sesión de `localStorage` a cookie httpOnly
**Por qué se dejó afuera:** requiere rehacer el flujo de pairing (backend setear cookie, frontend dejar de leer/escribir `localStorage` para el token, ajustar CORS `credentials`/`SameSite`). Riesgo de romper el pairing QR entre dispositivos si no se hace con cuidado. Decidido explícitamente con el usuario: bajo riesgo real (app local-first, un solo usuario, su propia LAN), se pospone.
**Dónde:** `frontend/src/services/api.ts` (lectura/escritura del token), `frontend/src/components/AuthGuard.tsx`, `backend/app/api/auth.py` (emisión del JWT), `backend/middleware/security.py`.

### 2. Cifrar en reposo el `GOOGLE_DRIVE_REFRESH_TOKEN`
**Por qué se dejó afuera:** hallazgo de severidad baja, no bloqueante. Hoy se guarda en texto plano en la tabla `Config` (mitigado parcialmente por el masking al leer vía API).
**Dónde:** `backend/app/api/backup.py:365-387` (`google_oauth_callback`). Sugerencia: Fernet con una clave derivada de `JWT_SECRET` o una nueva env var, cifrar antes de `db.add(Config(...))`.

### 3. Ampliar la suite de tests más allá de lo crítico
**Qué se hizo ya:** `backend/tests/` tiene 17 tests (precisión monetaria, matching de pagos con tarjeta, consistencia de IDs UUID) — cero cobertura antes de esto.
**Qué falta:** CRUD básico de los endpoints principales (accounts, transactions, categories, budgets), y cobertura de `statement_intelligence.py` / fingerprinting (el pipeline de importación de estados de cuenta vía Gemini, que es el área más compleja del backend). Nada de frontend tiene tests (no hay vitest/RTL configurado).

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

### 7. Boilerplate CRUD duplicado
32 módulos en `backend/app/api/` repiten el mismo patrón (router + get/post/put/delete + response_model) sin una base genérica compartida. Candidato a un factory/mixin de FastAPI, pero bajo impacto real — es limpieza, no un bug.

---

## Baja prioridad / cosas menores encontradas en el camino

### 8. `_match_card_by_name` puede dar falsos positivos con palabras genéricas
**Dónde:** `backend/app/services/credit_card_payment.py:66-78`. Matchea cualquier palabra ≥3 letras del nombre de la tarjeta contra la descripción — si una tarjeta se llama literalmente "Tarjeta A", cualquier descripción que diga "PAGO TARJETA" hace match por la palabra genérica "TARJETA", no por el nombre real. No es un bug de seguridad (el fallback es no-crear-nada si es ambiguo), pero puede asignar un pago al banco equivocado en casos borde. Detectado escribiendo `backend/tests/test_credit_card_payment.py`, no estaba en el alcance original.

### 9. Archivos de backup de `finance.db` acumulados
`backend/finance.db.backup`, `.pre_phase1_backup`, `.pre_uuid_migration` (+ el nuevo `.pre_healthcheck_backup_<fecha>` de esta sesión). Todos gitignorados, no es un problema de repo, solo clutter en disco si se quiere limpiar a mano.

### 10. CORS/pairing entre dispositivos LAN — verificar en vivo
Esta fase agregó la IP LAN detectada dinámicamente tanto al `ALLOWED_ORIGINS` del middleware de seguridad como al `allow_origins` de CORS en `main.py` (antes solo tenían `localhost`/`127.0.0.1`, lo cual en teoría ya bloqueaba el flujo de pairing QR entre el PC y el celular). No se probó en vivo con un dispositivo real en la LAN — vale la pena confirmar que el pairing por QR sigue funcionando end-to-end después de este cambio.

### 11. `db/db.ts` (stub de Dexie) sigue siendo un stub
Servicios activos (`ReportingService`, `SearchService`, `CurrencyService`, `IntegrityService`, `RecurringTransactionService`, `ScheduledBackupService`, `SmartImporter`, `SnapshotService`, `VehicleService`, `DataHydrationOverlay`) dependen de `db/db.ts`, que según su propio comentario "esa capa nunca se completó". No se investigó a fondo cuáles de estos servicios están realmente devolviendo datos reales vs silenciosamente vacíos como pasaba con `MaintenanceService` (que sí se confirmó roto y se borró). Vale la pena una auditoría dedicada: por cada servicio, confirmar si el dato que muestra en la UI es real o si viene de un stub que devuelve `[]`.

---

## Cómo retomar
Cada ítem es independiente — no hay orden estricto salvo que el punto 11 (auditar qué tan roto está `db/db.ts`) probablemente debería ir antes que invertir tiempo en los servicios que dependen de él.
