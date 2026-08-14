# Plan LLM de Tabula-Rasa
## Afinar el uso de Gemini (cloud) — sin IA local, sin dependencias nuevas

Fecha: 2026-08-13
Documento único de referencia. Reemplaza la versión anterior (comparativa de 4 modelos locales).

---

# Decisión

**Gemini se queda como único proveedor.** Se midieron 4 candidatos locales (LFM2.5-1.2B-Instruct, LFM2.5-350M, Qwen3-0.6B, Needle 2) contra las 7 funciones reales del proyecto, con prompts y schemas literales del código, incluyendo una segunda ronda con el formato de salida nativo de cada modelo. Gemini ganó las 8 comparaciones de precisión. Los locales exigen reescribir cada prompt o, en el caso de LFM2.5-350M, invertir en fine-tuning por caso de uso — trabajo que no tiene retorno mientras el consumo real de cuota esté lejos del límite (ver corrección abajo). No hay caso de negocio para sumar esa complejidad hoy.

Este documento es el plan de ejecución: qué arreglar en lo que el proyecto ya tiene, con Gemini, sin nada nuevo que instalar.

## Corrección importante sobre el diagnóstico previo

El plan anterior asumía que `sri_classifier.classify()` corría una vez por transacción sin agrupar (~300 requests/día, el 75% del consumo). **Es falso en el código actual.** Se revisaron los tres únicos usos del clasificador en todo el backend:

- `scripts/ai_health_check.py:50` — un script de diagnóstico manual, no producción.
- `api/fiscal.py:344` — importa la clase pero **nunca llama a `.classify()`**; `export-declaracion-sri` clasifica por coincidencia de palabras clave sobre `category.name` (líneas 380-391), sin IA.
- `services/sri_classifier.py` — la clase en sí.

La columna `Transaction.sri_category` (`models/transaction.py:55`) **no se asigna en ningún flujo real** — se busca `IS NULL` para calcular `sri_coverage_pct` (`ai_assistant_tools.py:356`), pero nada la llena nunca, así que ese indicador siempre reporta cobertura ≈0%.

Es una función construida y funcional (el health-check la ejercita con éxito) pero **nunca conectada** — no es código muerto para borrar, es una feature querida sin terminar. Se conecta en la Fase 3. El efecto en el diagnóstico de cuota: el problema es real pero mucho más chico de lo que se pensaba.

---

# 1. Inventario de las 20 llamadas a Gemini

| # | Ubicación | Clase de tarea | Rol |
|---:|---|---|---|
| 1 | `api/ai.py:40` | diagnóstico | LITE |
| 2 | `api/ai_categories.py:58` | clasificación | LITE |
| 3 | `api/ai_anomalies.py:135` | razonamiento forense | REASONING |
| 4 | `api/ai_receipts.py:68` | multimodal (audio) | MULTIMODAL |
| 5 | `api/ai_receipts.py:92` | multimodal (visión) | MULTIMODAL |
| 6 | `api/ai_goals.py:93` | razonamiento | REASONING |
| 7 | `api/net_worth_snapshots.py:181` | razonamiento | REASONING |
| 8 | `api/ai_insights.py:188` | narrativa con reglas | REASONING |
| 9 | `api/ai_insights.py:329` | narrativa con reglas | REASONING |
| 10 | `api/ai_whatif.py:121` | simulación 12 meses | REASONING |
| 11 | `api/ai_whatif.py:190` | generación | REASONING |
| 12 | `api/ai_audio.py:148` | multimodal (imagen/PDF) | MULTIMODAL |
| 13 | `api/ai_audio.py:260` | clasificación en lote | LITE |
| 14 | `api/ai_assistant.py:146` | chat + 22 tools read-only | AGENT |
| 15 | `services/categorizer.py:335` | clasificación en lote (80), **con retry/backoff ya implementado** | LITE |
| 16 | `services/sentinel_service.py:136` | narrativa + reglas numéricas | REASONING |
| 17 | `services/sri_classifier.py:62` | clasificación — **construida, no conectada a ningún flujo real** (ver Corrección arriba; se conecta en Fase 3) | LITE |
| 18 | `services/statement_intelligence.py:125` | multimodal (PDF) | MULTIMODAL |
| 19 | `services/account_intelligence.py:102` | extracción desde texto | LITE |
| 20 | `services/audit_service.py:75` | booleano | REASONING |

---

# 2. El problema de cuota, con números reales

| Modelo cloud | RPM | TPM | RPD |
|---|---:|---:|---:|
| `gemini-3.1-flash-lite` | 150 | 250K | **500** |
| `gemini-3.5-flash-lite` | 15 | 250K | **500** |

Día activo con importación de 300 transacciones — **sin contar `sri_classifier`, que hoy no corre**:

| Consumidor | Requests |
|---|---:|
| `ai_assistant.chat` | 25–40 |
| Dashboard (insights, warnings, sentinel, net-worth) | ~20 |
| `parse_statement` multimodal | 1–8 |
| `categorize_batch` — agrupa de 80 en 80 | 2–4 |
| **Total** | **≈ 50–70 / 500** |

**No hay una crisis de cuota hoy.** El margen es amplio incluso en un día de importación pesada. Esto tiene dos consecuencias sobre el plan anterior:

1. **La Fase 1 (reasignar `REASONING_MODEL` a `gemini-3.5-flash-lite`, 15 RPM) ya no depende de la Fase 0.** La dependencia que until ahora las ordenaba era la competencia contra ~300 categorizaciones sueltas de `sri_classifier` — que no existen. Las ~20 llamadas de razonamiento por día no acercan los 15 RPM.
2. Las dos fallas reales que sí quedan (throttle mal calibrado, latencia de categorización individual) siguen valiendo la pena arreglarse — no por cuota, sino porque son bugs medibles con costo directo en tiempo de espera del usuario.

---

# 3. Plan de acción

## Fase 0 — Higiene de lo existente. Sin modelos, sin dependencias

| # | Acción | Archivo | Efecto medido |
|---:|---|---|---|
| 0.1 | Bajar el throttle de `categorize_batch` — hoy duerme 3 s antes del primer lote y 6 s entre lotes *"para respetar los 15 RPM"* | `services/categorizer.py:294-298` | la cuota real de `LITE_MODEL` es **150 RPM**, no 15 — el throttle está calibrado contra un límite equivocado. Bajarlo a ~0.5-1 s corta minutos de espera en importaciones grandes sin acercarse al límite real. |
| 0.2 | Separar el throttle de lote grande del de item único: `get_semantic_category` (fallback de UI para un solo ítem) reusa `categorize_batch`, que aplica el mismo `sleep` pensado para chunks de 80 | `services/categorizer.py:192` | hoy, re-categorizar una sola transacción desde la UI paga el mismo `sleep(3-6s)` que un lote completo cuando cae en Tier 4 (IA). Con el throttle bajado (0.1) el impacto baja solo; si se quiere eliminarlo del todo, que el camino de un solo ítem salte el `sleep` directamente. |
| 0.3 | Plegar acentos y colapsar espacios en `normalize_description` (hoy solo `.strip().upper()`) | `services/categorizer.py:42-44` | más aciertos en Tier 1 (patrón por substring) → menos transacciones caen a Tier 4 (IA) → menos requests y menos latencia por importación. |

Ninguno de los tres requiere tocar `sri_classifier` — esa es una decisión aparte (§4).

## Fase 1 — Reasignar roles cloud (ya no depende de la Fase 0)

| Rol | Actual | Propuesto | Justificación medida |
|---|---|---|---|
| `REASONING_MODEL` | `gemini-3.1-flash-lite` | **`gemini-3.5-flash-lite`** | mismo 100% de cumplimiento en insights/sentinel/what-if, **~3× más rápido** (1.9 s vs 5.4 s de media). 15 RPM sobran para ~20 llamadas/día. |
| `AGENT_MODEL` | `gemini-3.1-flash-lite` | sin cambio | 86% en tool calling sobre las 22 herramientas reales (12/12 descontando caídas de infraestructura); 150 RPM aguantan el bucle de chat. |
| `MULTIMODAL_MODEL` | `gemini-3.1-flash-lite` | sin cambio | sin alternativa evaluada; no hay razón para tocarlo. |
| `LITE_MODEL` | `gemini-3.1-flash-lite` | sin cambio | 100% en categorización en lote (10/10). |

Cambio de una línea en `app/services/ai_models.py:15`:
```python
REASONING_MODEL = os.getenv("REASONING_MODEL", "gemini-3.5-flash-lite")
```

## Fase 2 — Resiliencia ante fallos transitorios de Gemini (sin dependencias nuevas)

Durante el benchmark, **3 de 28 requests a Gemini devolvieron `503 UNAVAILABLE`** (~11%) — no por cuota, por sobrecarga temporal del servicio. Hoy la mayoría de los 20 puntos de llamada no reintentan: fallan directo al usuario.

- `services/categorizer.py:331-378` **ya implementa** retry con backoff (5 intentos, 8/12/16s…) específicamente para 503/UNAVAILABLE. Es el único de los 20 que lo tiene.
- `api/ai_assistant.py:246-265` — sin retry: un 503 se traduce directo a HTTP 503 para el usuario del chat.
- `api/ai_shared.py:call_gemini_json` (usado por `ai_categories.py`, `ai_whatif.py`, `ai_anomalies.py`, `ai_receipts.py`) — sin retry: cualquier excepción, incluida un 503 transitorio, se mapea a HTTP 500 genérico.
- El resto de los servicios (`sentinel_service.py`, `audit_service.py`, `ai_insights.py`, `net_worth_snapshots.py`, `ai_goals.py`, `statement_intelligence.py`, `account_intelligence.py`) llaman a Gemini sin ningún retry.

**Acción:** extraer el patrón de retry que ya funciona en `categorizer.py` a un helper compartido en `app/services/ai_models.py` (mismo módulo que ya centraliza la config de modelos), y aplicarlo en `call_gemini_json` (cubre 4 endpoints de un solo cambio) y en `ai_assistant.py`. Sin librerías nuevas — es el mismo `try/except` + `time.sleep` con backoff que ya existe, factorizado en un solo lugar en vez de copiado 20 veces.

```python
# app/services/ai_models.py
import time
from typing import Callable, TypeVar

T = TypeVar("T")

def with_gemini_retry(fn: Callable[[], T], max_retries: int = 5) -> T:
    """Reintenta con backoff ante 503/UNAVAILABLE transitorios de Gemini."""
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as e:
            transient = "503" in str(e) or "UNAVAILABLE" in str(e)
            if not transient or attempt == max_retries - 1:
                raise
            time.sleep((attempt + 2) * 4)  # 8s, 12s, 16s, 20s...
    raise RuntimeError("unreachable")
```

## Fase 3 — Conectar `sri_classifier` al flujo real

Confirmado: se conecta. Mismo criterio que el resto del plan — agrupado desde el día 1, nunca 1 request por transacción, reusando el retry de la Fase 2.

**Dónde se dispara:** el punto natural ya existe. `api/transactions.py:197` dispara `background_tasks.add_task(categorize_transactions_background, inserted_ids)` después de cada importación — un job en background que ya agrupa y categoriza (`ai_background.py:11-56`). SRI se agrega ahí mismo, no como un flujo nuevo.

| # | Acción | Archivo |
|---:|---|---|
| 3.1 | Agregar `sri_classify_batch(transactions, db_session)` a `sri_classifier.py`, calcado del patrón de `categorize_batch`: un solo `generate_content` por chunk de 80 con `response_schema` de lista `{index, sri_category}`, envuelto en `with_gemini_retry` (Fase 2) | `services/sri_classifier.py` (nueva función, junto a `classify()`) |
| 3.2 | En `categorize_transactions_background`, después de aplicar `categorize_batch`, filtrar las transacciones de tipo `expense` con `sri_category IS NULL` entre las recién importadas y pasarlas a `sri_classify_batch` | `services/ai_background.py:39-50` |
| 3.3 | Asignar `tx.sri_category` al resultado y hacer `commit()` junto con la categorización normal (un solo commit, no dos) | `services/ai_background.py:41-49` |

**Alcance:** solo transacciones `expense` — es la misma restricción que ya aplica la lógica de palabras clave en `fiscal.py:374`, y las categorías SRI (Alimentación, Salud, Vivienda, etc.) no aplican a ingresos.

**Qué NO cambia en esta fase:** `export-declaracion-sri` (`fiscal.py:333-422`) sigue calculando por palabras clave sobre `category.name`, no por `sri_category`. Migrar el export a usar el campo real es un cambio aparte, opcional, una vez que `sri_coverage_pct` confirme que la clasificación por IA está corriendo de forma confiable.

**Costo de cuota:** una importación de 300 transacciones ya paga 2-4 requests por `categorize_batch`; `sri_classify_batch` agrega 2-4 más con el mismo chunking. Sigue muy por debajo del límite (§2).

**Retrocompatibilidad:** las transacciones ya importadas antes de este cambio quedan con `sri_category IS NULL` — no hay backfill automático en esta fase. Si se quiere, es un script aparte que llama a `sri_classify_batch` sobre el histórico completo, corrido una sola vez.

## Fase 4 — Personas de IA: hay 8 construidas, solo 6 se pueden elegir

`services/ai_prompts.py:get_persona_prompt()` define **8 personas** completas (mismo formato: Tono / Directiva Creativa / Estilo, y todas instruyen explícitamente a no repetir frases prefabricadas): `professional`, `roast`, `coach`, `minimalist`, `professor`, `gamified`, `detective`, `sabio`. Se usan en 2 de los 20 puntos de llamada — `ai_assistant.py:105` (chat) y `ai_insights.py:169` (insights del dashboard) — leyendo el mismo config `ai_persona`.

**El hallazgo real: `frontend/src/components/Settings/LabsTab.tsx:10-17` solo lista 6.** `minimalist` ("Apple de las finanzas", conclusiones puras) y `professor` (clases magistrales de economía aplicadas a tus datos) están escritas, funcionan si se setea `ai_persona` a mano, pero **el usuario nunca puede elegirlas** — no hay botón. Es trabajo de prompt engineering ya pagado que no está entregado.

**¿Hay repetidas? ¿Sobra alguna?** No, entre las 8 no hay dos que digan lo mismo — cada una ocupa un registro distinto (analista sobrio / comedia negra / coach deportivo / minimalismo tipo Apple / cátedra económica / narrador RPG / detective noir / monje zen). El par más parecido es `professional` y `minimalist` — ambas valoran la brevedad sobre el adorno — pero se diferencian en grado: `professional` es un analista formal, `minimalist` fuerza una estructura casi telegráfica ("Hecho. Impacto. Acción."). No amerita eliminar ninguna; el problema no es exceso, es que 2 de 8 están escondidas.

| # | Acción | Archivo |
|---:|---|---|
| 4.1 | Agregar `minimalist` y `professor` al array `PERSONAS` de `LabsTab.tsx`, mismo formato `{id, label, desc, icon}` que las 6 existentes | `frontend/src/components/Settings/LabsTab.tsx:10-17` |

Sugerencia de copy, coherente con el tono de las otras 6:

```ts
{ id: 'minimalist', label: 'Minimalista', desc: 'Cero relleno. Solo el hecho, el impacto y la acción.', icon: '⚪' },
{ id: 'professor', label: 'Catedrático', desc: 'Convierte cada uno de tus gastos en una clase magistral.', icon: '🎓' },
```

**Nota aparte, no de personas:** `ai_insights.py:196` declara `"insights": {"type": "array", "items": {"type": "string"}}` sin `minItems`/`maxItems`, aunque el prompt pide "Exactamente 3". El schema no lo obliga — Gemini normalmente lo respeta pero no está garantizado por contrato. Si se quiere blindar, es agregar `"minItems": 3, "maxItems": 3` al schema. No se incluye en el checklist porque no fue parte de lo pedido; queda anotado para cuando se toque ese archivo.

## Fase 4.2 — Las personas no tienen suficiente conciencia de los datos para cumplir lo que prometen

No es un problema de cómo están escritas — es lo que reciben. `_build_transaction_summary()` (`services/insights_builders.py:21-62`) es la única fuente de "patrones" del snapshot de insights, y tiene dos huecos concretos:

1. **Solo detecta outliers grandes, nunca gasto recurrente chico.** La única lógica de detección de patrones es "monto > 2× el gasto promedio" (línea 50). Es lo opuesto de lo que necesita `detective` (busca "cómplices" — gastos hormiga que pasan desapercibidos por chicos y repetidos) o `roast`. No existe ningún conteo de frecuencia por comercio o categoría.
2. **Nunca llega el nombre del comercio, solo la categoría.** El snapshot manda `"Alimentación: $340.00"`, nunca `"STARBUCKS"`. Y no es una barrera de privacidad real: `services/privacy.py:36` (`mask_description`) ya enmascara nombres de persona, números de cuenta y direcciones, pero **deja pasar la marca del comercio** (`"KFC Av. Francisco de Orellana"` → `"KFC [LOCATION]"`) — es la misma utilidad que `categorizer.py` ya usa para mandarle el `Beneficiario` a Gemini sin problema. Insights simplemente nunca la conectó.

**Consecuencia medible:** la propia descripción de `roast` en el selector de personalidad dice *"Te humillará por cada café que compres fuera"* — con los datos de hoy no puede cumplirlo. Solo sabe "gastaste $340 en Alimentación", no "van 6 veces esta semana en Starbucks, $42 total". Le pega igual a `detective` (sin comercio que rastrear) y a `professor` (necesita patrones específicos para anclar conceptos económicos, no un total agregado).

| # | Acción | Archivo |
|---:|---|---|
| 4.2.1 | Nueva función `_build_recurring_small_expenses(db, now)`: agrupa transacciones de los últimos 30 días por `beneficiary` (o `description` normalizada con la misma función de `categorizer.py:42` si no hay beneficiario), cuenta ocurrencias, filtra grupos con **≥3 ocurrencias** y monto promedio **por debajo del gasto promedio general**, enmascara el nombre con `mask_description` y devuelve los top 5 por monto total acumulado | `services/insights_builders.py` (nueva función, junto a `_build_transaction_summary`) |
| 4.2.2 | Agregar la sección `GASTOS HORMIGA (recurrentes, últimos 30 días)` al `financial_snapshot` con el resultado de 4.2.1 | `api/ai_insights.py` (junto al bloque de `ACTIVIDAD MÓVIL`, ~línea 113) |

Con esto, `detective`, `roast` y `professor` — las tres personas más exigentes en datos — pasan de tener solo agregados por categoría a tener munición real y específica para cumplir lo que su propio prompt (y en el caso de `roast`, su propia descripción en la UI) promete. Al resto de las personas (`sabio`, `minimalist`, `gamified`, `professional`, `coach`) no les cambia nada porque no la necesitan — siguen sirviéndose del snapshot agregado como hasta ahora.

## Fase 4.3 — Dos personas se contradicen a sí mismas: piden espontaneidad y luego imponen un molde literal

7 de las 8 personas tienen una línea explícita anti-plantilla (`roast`: "No uses frases prefabricadas... nunca te repitas"; `detective`: "No uses un guion fijo"; `professor`: "No repitas las mismas leyes siempre"; `sabio`: "metáforas filosóficas nuevas para cada situación"). Pero **2 de las 8 tienen, en la misma definición, una estructura citada textualmente que garantiza la repetición que dicen evitar**:

- **`coach`** — `"Estilo: Termina siempre con un 'Ejercicio del día'..."`: esa etiqueta exacta, entre comillas, en cada respuesta. Contradice la frase anterior del mismo prompt ("no uses frases cliché").
- **`minimalist`** — `"Usa la estructura: 'Hecho. Impacto. Acción.'"`: cita literal de tres palabras. El caso más claro — le pide espontaneidad y en la siguiente frase le da el molde textual a rellenar.

Se comprobó además que **no hay un `temperature` forzado a 0** en `ai_insights.py` ni `ai_assistant.py` (ninguno de los dos lo especifica; usan el default del SDK) — la rigidez no viene de la configuración del modelo, viene literalmente del texto de esas dos líneas. Se descarta esa hipótesis.

Dos notas menores, sin llegar a ser una contradicción — se incluyen igual porque el objetivo es que las 8 queden sin ningún molde fijo:
- `professor` repite siempre el marco "charla TED exclusiva" — es una guía de tono, no una cita obligatoria, pero limita la forma de apertura a un solo formato.
- `gamified` restringe el vocabulario de moneda a exactamente "ORO o CRÉDITOS" — funciona, pero cierra la puerta a que el modelo invente su propia moneda según el mundo que esté narrando en esa respuesta.

**Reescritura propuesta en `services/ai_prompts.py`** — mismo rol y objetivo, sin cita textual obligatoria:

| Persona | Línea actual | Línea nueva |
|---|---|---|
| `coach` | `- Estilo: Termina siempre con un "Ejercicio del día" que sea una acción concreta y retadora basada en sus números.` | `- Estilo: Cierra siempre con un reto concreto y accionable basado en sus números — ponle tu propio nombre cada vez, nunca repitas la misma etiqueta ni la misma estructura de cierre.` |
| `minimalist` | `- Estilo: Sin saludos, sin relleno. Usa la estructura: "Hecho. Impacto. Acción." de forma natural y adaptativa.` | `- Estilo: Sin saludos, sin relleno. Comunica en tres golpes — el hecho, su impacto, la acción a tomar — pero encuentra la forma mínima de cada uno con tus propias palabras cada vez; nunca repitas la misma plantilla o las mismas etiquetas.` |
| `professor` | `- Estilo: Haz que el usuario sienta que está en una charla TED exclusiva sobre su propia billetera.` | `- Estilo: Haz que el usuario sienta que está descubriendo algo revelador sobre su propia billetera. Varía el formato de la lección cada vez — a veces una anécdota, a veces una analogía, a veces una pregunta socrática — nunca abras siempre igual.` |
| `gamified` | `- Moneda: ORO o CRÉDITOS. Prohibido usar la palabra "centavos".` | `- Moneda: inventa o varía el nombre según el mundo que estés narrando en cada respuesta (oro, créditos, maná, chips — el que mejor encaje). Prohibido usar la palabra "centavos".` |

| # | Acción | Archivo |
|---:|---|---|
| 4.3.1 | Reemplazar las 4 líneas de la tabla en las personas `coach`, `minimalist`, `professor`, `gamified` | `services/ai_prompts.py:44` (coach), `:50` (minimalist), `:56` (professor), `:62` (gamified) |

No se toca `roast`, `detective`, `sabio` ni `professional` — ya cumplen el objetivo sin ningún molde citado textualmente.

---

# 4. Checklist de implementación

- [ ] `services/categorizer.py:294-298` — bajar throttle de 3s/6s a ~0.5-1s
- [ ] `services/categorizer.py:192` o su throttle — evitar que un solo ítem pague el `sleep` pensado para lotes de 80
- [ ] `services/categorizer.py:42-44` — `normalize_description`: plegar acentos, colapsar espacios
- [ ] `app/services/ai_models.py:15` — `REASONING_MODEL` → `gemini-3.5-flash-lite`
- [ ] `app/services/ai_models.py` — agregar `with_gemini_retry` (ver Fase 2)
- [ ] `api/ai_shared.py:call_gemini_json` — envolver la llamada a `generate_content` con `with_gemini_retry`
- [ ] `api/ai_assistant.py:146-244` — envolver `chat.send_message`/creación de chat con `with_gemini_retry`
- [ ] Verificar manualmente: `services/sentinel_service.py`, `services/audit_service.py`, `api/ai_insights.py`, `api/net_worth_snapshots.py`, `api/ai_goals.py`, `services/statement_intelligence.py`, `services/account_intelligence.py` — aplicar `with_gemini_retry` donde llamen a Gemini directamente
- [ ] `services/sri_classifier.py` — agregar `sri_classify_batch` (Fase 3.1)
- [ ] `services/ai_background.py:39-50` — llamar a `sri_classify_batch` para expenses sin `sri_category`, mismo commit (Fase 3.2-3.3)
- [ ] `frontend/src/components/Settings/LabsTab.tsx:10-17` — agregar `minimalist` y `professor` al array `PERSONAS` (Fase 4.1)
- [ ] `services/insights_builders.py` — agregar `_build_recurring_small_expenses` (Fase 4.2.1)
- [ ] `api/ai_insights.py` — sección `GASTOS HORMIGA` en el `financial_snapshot` (Fase 4.2.2)
- [ ] `services/ai_prompts.py` — reescribir las 4 líneas de `coach`, `minimalist`, `professor`, `gamified` (Fase 4.3.1)

---

# 5. Criterios de éxito

1. Una importación de 300 transacciones que hoy tarda minutos por el throttle baja a segundos, sin acercarse a 150 RPM.
2. Insights, sentinel y what-if responden ~3× más rápido sin perder cumplimiento de formato.
3. Un `503 UNAVAILABLE` transitorio de Gemini ya no se traduce en un error visible al usuario en los puntos con retry — se reintenta en silencio.
4. Después de importar transacciones nuevas, `get_audit_report.sri_coverage_pct` sube por encima de 0% — señal de que `sri_classify_batch` está corriendo. El histórico previo a la Fase 3 se queda en `sri_category IS NULL` salvo que se corra el backfill opcional mencionado en la Fase 3.
5. En Ajustes > Labs, el selector de personalidad muestra 8 opciones en vez de 6.
6. Un insight en modo `roast` o `detective` puede nombrar un comercio recurrente específico (enmascarado) en vez de quedarse en el total de la categoría.
7. Pedir varios insights seguidos en modo `coach` o `minimalist` con los mismos datos ya no devuelve la etiqueta "Ejercicio del día" ni la frase "Hecho. Impacto. Acción." de forma literal — el cierre/la estructura cambia de redacción cada vez, aunque cumpla la misma función.
