# 🏛️ Tabula Rasa: Local-First Financial Operating System

**La soberanía absoluta de tus finanzas. Privacidad blindada, integridad matemática y latencia cero.**

![Local-First](https://img.shields.io/badge/Architecture-Local--First-blue)
![Offline-Ready](https://img.shields.io/badge/Status-Offline--Ready-green)
![Zero-Knowledge](https://img.shields.io/badge/AI-Zero--Knowledge-purple)
![Ecuador-Ready](https://img.shields.io/badge/Region-Ecuador--Ready-red)
![Gemini-AI](https://img.shields.io/badge/AI-Model-gemini--3.1--flash--lite--preview-orange)

---

## 📖 Filosofía Local-First: Soberanía del Dato

**Tus datos te pertenecen. Punto.**

Tabula Rasa rechaza el modelo SaaS (Firebase, Supabase) donde tus datos financieros viven en servidores de terceros. En su lugar, implementamos una arquitectura **Local-First** donde:

- **IndexedDB** es tu base de datos en el navegador (ningún dato sale sin tu consentimiento explícito)
- **Sincronización Reactiva** con FastAPI + SQLite en modo WAL para concurrencia sin bloqueos
- **Offline-First**: Trabaja sin internet, sincroniza cuando reconectes
- **Zero-Knowledge AI**: La IA solo ve datos sanitizados (Cédulas/RUCs enmascarados antes del envío)

---

## 🏗️ Los 4 Pilares de la Ingeniería en Tabula Rasa

### 💎 Integridad Monetaria

**Inmunidad total a los errores de redondeo IEEE 754.**

```typescript
// Branded Type: previene asignación accidental de floats
export type Cents = number & { __brand: 'Cents' };

// Conversión con Decimal.js-light (precisión arbitraria)
export const toCents = (value: unknown): Cents => {
  const d = toDecimal(value);  // Evita pérdida de precisión
  return Math.round(d.mul(100).toNumber()) as Cents;
};
```

- **Branded Types**: `Cents` como tipo nominal previene errores de tipo en tiempo de compilación
- **Decimal.js-light**: Biblioteca ligera para aritmética de punto flotante de precisión arbitraria
- **Sin parseFloat/Math.abs**: Los parsers bancarios manejan strings directamente para evitar conversión a float

### 🛡️ Blindaje Zero-Knowledge: Privacidad Absoluta

**Sanitización exhaustiva con Python + Regex antes de enviar datos a la API.**

```python
# Backend: Sanitización de PII con expresiones regulares
import re

def sanitize_pii_data(data: dict) -> tuple[dict, dict]:
    """
    Sanitiza datos PII usando Regex antes de enviar a IA.
    Retorna: (datos_sanitizados, mapa_hidratación)
    """
    hydration_map = {}
    
    # Patrón Regex para Cédulas ecuatorianas (10 dígitos)
    cedula_pattern = re.compile(r'\b\d{10}\b')
    # Patrón Regex para RUCs ecuatorianos (13 dígitos)
    ruc_pattern = re.compile(r'\b\d{13}\b')
    # Patrón para números de cuenta/celular
    account_pattern = re.compile(r'\b\d{10,20}\b')
    
    def replace_pii(match, pii_type):
        placeholder = f"[{pii_type}_{len(hydration_map)}]"
        hydration_map[placeholder] = match.group()
        return placeholder
    
    # Sanitización recursiva de objetos anidados
    def sanitize_recursive(obj):
        if isinstance(obj, dict):
            return {k: sanitize_recursive(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_recursive(item) for item in obj]
        elif isinstance(obj, str):
            sanitized = cedula_pattern.sub(lambda m: replace_pii(m, 'TAX_ID'), obj)
            sanitized = ruc_pattern.sub(lambda m: replace_pii(m, 'RUC'), sanitized)
            sanitized = account_pattern.sub(lambda m: replace_pii(m, 'ACCOUNT'), sanitized)
            return sanitized
        return obj
    
    return sanitize_recursive(data), hydration_map
```

- **Blindaje Zero-Knowledge**: Python + Regex para sanitización exhaustiva antes del envío a API
- **Independencia de servicios externos**: Sin dependencia crítica de servicios de terceros para privacidad
- **Sanitización recursiva**: Atraviesa objetos JSON anidados y arrays para enmascarar PII en cualquier profundidad
- **Validación Módulo 10**: Cédulas (10 dígitos) y RUCs (13 dígitos) validados con algoritmo Módulo 10
- **Masking reversible**: `[TAX_ID_1]`, `[PERSON_2]`, `[ACCOUNT_3]` con mapa de hidratación para restaurar después de la respuesta de IA
- **Stop words inteligentes**: No enmascara términos financieros legítimos (pago, banco, supermaxi, etc.)

### ⏳ Identidad Determinista

**UUIDv5 + SHA-256: Sin colisiones, incluso al importar 50,000 transacciones.**

```python
# Generación determinista de UUIDv5
def generate_uuid_from_legacy_id(legacy_id: Union[int, str], table_name: str = "default") -> str:
    namespace_key = f"{table_name}:{legacy_str}"
    new_uuid = uuid.uuid5(NAMESPACE_UUID, namespace_key)
    return str(new_uuid)
```

```typescript
// SHA-256 hashing para deduplicación
export async function generateTransactionHash(
  date: string,
  amount: number,
  description: string,
  accountId: string
): Promise<string> {
  const str = `${accountId}:${date}:${description}:${amount}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return hashHex;
}
```

- **UUIDv5 con namespace fijo**: El mismo ID legacy siempre produce el mismo UUID (determinista)
- **SHA-256 para deduplicación**: Hash criptográfico de transacciones para evitar duplicados en importaciones masivas
- **Namespace por tabla**: `transactions:123` ≠ `accounts:123` (previene colisiones cross-entity)

### ⏱️ Autoconciencia Temporal

**Si alteras el pasado, el presente se invalida automáticamente.**

```python
# Migración: is_stale flag en net_worth_snapshots
class NetWorthSnapshot(Base):
    is_stale = Column(Boolean, default=False)  # Invalida snapshots antiguos
```

- **Mecanismo `is_stale`**: Cuando se modifica una transacción histórica, los snapshots de patrimonio neto se marcan como obsoletos
- **Reconciliación automática**: El sistema detecta snapshots stale y los recalcula en segundo plano
- **Patrimonio neto real**: Garantiza que las proyecciones de Cash Flow Forecast se basen en datos consistentes

---

## 🚀 Innovaciones Técnicas (The "Cool" Stuff)

### 🧠 Motor de IA: gemini-3.1-flash-lite-preview

**Inteligencia artificial sin comprometer la soberanía del dato.**

```python
# Backend: Integración con Google GenAI SDK
from google import genai
from google.genai import types

class AICategorizer:
    def __init__(self):
        self.client = genai.Client()
        self.model = "gemini-3.1-flash-lite-preview"
    
    async def categorize_transaction(self, description: str, amount: float) -> str:
        """
        Categoriza transacciones usando gemini-3.1-flash-lite-preview
        con datos previamente sanitizados (Zero-Knowledge).
        """
        sanitized_data, hydration_map = sanitize_pii_data({
            "description": description,
            "amount": amount
        })
        
        prompt = f"Categoriza esta transacción: {sanitized_data['description']}"
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt
        )
        
        # Restaurar contexto si es necesario
        return response.text
```

- **Modelo**: gemini-3.1-flash-lite-preview para inferencia rápida y eficiente
- **SDK google-genai**: Interacción directa con la API de Google AI
- **Zero-Knowledge Integration**: Datos sanitizados antes del envío (PII enmascarado)
- **Features Inteligentes**:
  - **Categorización automatizada**: Clasificación inteligente de transacciones basada en descripciones
  - **Detección de anomalías**: Identificación de patrones de consumo inusuales
  - **Modelado predictivo**: Proyección de flujo de caja con aprendizaje automático
- **Latencia mínima**: Modelo flash para respuestas en tiempo real sin sacrificar precisión

### Protocolo Phoenix: Autocorrección de Entorno

**El sistema se cura solo al arrancar.**

```powershell
# menu.ps1: Self-Healing automático
function Start-Application {
  # 1. Asesino de Zombies Quirúrgico (limpia puertos 8001/5173)
  Stop-SpecificPorts | Out-Null
  
  # 2. Backend Health Check & Self-Healing
  if (Test-Path $venvPython) {
    & $venvPython -c "import fastapi, sqlalchemy, pydantic, cryptography"
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Entorno virtual corrupto. Reinstalando..."
      Safe-RemoveVenv $venvPath
      python -m venv $venvPath
      & $venvPython -m uv pip install -r requirements.txt  # 10x más rápido
    }
  }
}
```

- **Validación de dependencias críticas**: Detecta entornos virtuales corruptos y reinstala automáticamente
- **Instalación con uv**: 10-100x más rápido que pip tradicional
- **Health Check Polling**: Espera hasta que el backend responda antes de iniciar el frontend (evita race conditions)

### Storage Guardian: Monitoreo Proactivo de Cuota

**Alerta al 80%, crítico al 95%. Nunca te sorprenda sin espacio.**

```typescript
export async function checkStorageQuota(): Promise<StorageStatus> {
  const estimate = await navigator.storage.estimate();
  const usagePercent = estimate.quota > 0 ? estimate.usage / estimate.quota : 0;
  
  if (usagePercent >= 0.95) {
    status = 'critical';
    window.dispatchEvent(new CustomEvent('ui:notify:storage_low', { detail: status }));
  } else if (usagePercent >= 0.80) {
    status = 'warning';
    window.dispatchEvent(new CustomEvent('ui:notify:storage_low', { detail: status }));
  }
}
```

- **Monitoreo continuo**: `navigator.storage.estimate()` para rastrear uso de IndexedDB
- **Ajuste de política de sync**: En modo crítico, solo se sincroniza el ledger (no historial completo)
- **Alertas UI**: Eventos custom para notificar al usuario antes de que sea demasiado tarde

### ⚡ Lógica Avanzada: Telemetría y Depreciación

**Cálculo de activos y reportes multidivisa con precisión bancaria.**

```python
# Backend: Cálculo de depreciación de activos
from datetime import datetime
from decimal import Decimal

class AssetDepreciationService:
    def calculate_depreciation(
        self, 
        asset_value: Decimal, 
        purchase_date: datetime, 
        depreciation_method: str = "straight_line",
        useful_life_years: int = 5
    ) -> dict:
        """
        Calcula depreciación de activos con métodos contables estándar.
        """
        years_elapsed = (datetime.now() - purchase_date).days / 365.25
        annual_depreciation = asset_value / useful_life_years
        
        if depreciation_method == "straight_line":
            accumulated = annual_depreciation * years_elapsed
            current_value = asset_value - accumulated
        elif depreciation_method == "declining_balance":
            rate = 2 / useful_life_years
            accumulated = asset_value * (1 - (1 - rate) ** years_elapsed)
            current_value = asset_value - accumulated
        
        return {
            "current_value": current_value,
            "accumulated_depreciation": accumulated,
            "depreciation_rate": annual_depreciation / asset_value
        }

# Backend: Arquitectura de reportes multidivisa
class MultiCurrencyReportService:
    def generate_balance_sheet(self, base_currency: str = "USD") -> dict:
        """
        Genera balance sheet con conversión multidivisa en tiempo real.
        """
        assets_by_currency = self.get_assets_by_currency()
        exchange_rates = self.fetch_exchange_rates()
        
        converted_assets = {}
        for currency, value in assets_by_currency.items():
            if currency == base_currency:
                converted_assets[currency] = value
            else:
                rate = exchange_rates.get(currency, Decimal('1.0'))
                converted_assets[currency] = value * rate
        
        return {
            "base_currency": base_currency,
            "assets": converted_assets,
            "total_assets": sum(converted_assets.values()),
            "exchange_rates_used": exchange_rates
        }

# Telemetría: Métricas de uso y rendimiento
class TelemetryService:
    def track_user_metrics(self, user_id: str, action: str) -> None:
        """
        Registra telemetría para análisis de uso sin PII.
        """
        sanitized_user_id = self.hash_user_id(user_id)  # SHA-256 hashing
        metrics = {
            "user_hash": sanitized_user_id,
            "action": action,
            "timestamp": datetime.now().isoformat(),
            "performance_ms": self.measure_performance()
        }
        self.send_to_analytics(metrics)
```

- **Telemetría**: Métricas de uso y rendimiento con hashing de user IDs (sin PII)
- **Cálculo de depreciación**: Métodos contables estándar (straight-line, declining balance)
- **Arquitectura multidivisa**: Conversión en tiempo real con tasas de cambio
- **Balance sheet dinámico**: Reportes financieros con soporte multi-moneda
- **Precisión bancaria**: Uso de Decimal para todos los cálculos financieros

### Higiene de Memoria: Exportación via Streaming

**50,000+ transacciones sin congelar la interfaz.**

```typescript
export class StreamedExporter {
  private readonly BUFFER_SIZE = 500;
  
  async exportTransactions(): Promise<Blob> {
    const chunks: string[] = [];
    let buffer = this.HEADER;
    
    // Streaming con .each() (no .toArray() - previene crash de memoria)
    await db.transactions.orderBy('date').each((txn) => {
      buffer += `${txn.id},${txn.date},"${escapedDesc}",...\n`;
      
      if (rowCount % this.BUFFER_SIZE === 0) {
        chunks.push(buffer);
        buffer = '';
        // Yield UI (setTimeout 0ms) - previene bloqueo del main thread
        return new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    });
    
    return new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  }
}
```

- **Buffer de 500 registros**: Flush periódico para evitar acumulación de memoria
- **Streaming con `.each()`**: No carga todos los datos en RAM (a diferencia de `.toArray()`)
- **UI yielding**: `setTimeout(0)` entre chunks para mantener la interfaz responsiva

---

## ✨ Core Features

### Dashboards Reactivos
- **Dashboard Principal**: Tarjetas de resumen, transacciones recientes, breakdown de gastos
- **Cash Flow Forecast**: Proyección a 30/60/90 días con detección de saldos negativos
- **Safe to Spend**: Cálculo inteligente de presupuesto disponible considerando gastos fijos, deudas y proyecciones estacionales

### Parsers Bancarios Inteligentes (Ecuador)
```typescript
// Soporte nativo para bancos ecuatorianos
const PARSERS: BankParser[] = [
  pichinchaParser,   // Banco Pichincha: FECHA, DESCRIPCION, DEBITO, CREDITO
  guayaquilParser,   // Banco Guayaquil: FECHA, CONCEPTO, VALOR
  pacificoParser,    // Banco Pacífico: FECHA TRANSACCION, DESCRIPCION, ABONO, CARGO
  genericParser      // Fallback genérico
];
```

### Búsqueda Avanzada con Normalización Unicode NFD
```typescript
// Búsqueda insensible a tildes y diacríticos
export function normalizeString(text: string): string {
  const lowercased = text.toLowerCase();
  const nfd = lowercased.normalize('NFD');  // Descomposición Unicode
  const removedDiacritics = nfd.replace(/[\u0300-\u036f]/g, '');  // Elimina marcas diacríticas
  return removedDiacritics;
}
// "pago" === "págó" === "pagó" (todas coinciden)
```

### Gestión de Conflictos Offline-First
- **FIFO Queue**: Sincronización en orden cronológico
- **Conflict Stashing**: Conflictos 409 se archivan para resolución manual
- **Server Wins Policy**: El servidor prevalece para estado, pero el usuario decide qué datos mantener
- **Bit-a-bit Integrity Verification**: Hashes SHA-256 para detectar corrupción en tránsito

---

## 📁 Arquitectura y Estructura

```
personal-website/
├── backend/
│   ├── app/
│   │   ├── api/              # Endpoints FastAPI (REST)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── services/         # Business logic layer
│   │   ├── ai/               # Zero-Knowledge AI integration
│   │   ├── analytics/        # Data analysis & forecasting
│   │   └── utils/            # UUIDv5, crypto helpers
│   ├── alembic/              # Database migrations (is_stale, UUID rotation)
│   ├── database.py           # SQLite WAL mode configuration
│   ├── main.py               # FastAPI application entrypoint
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/       # React UI components
│   │   ├── pages/            # Page-level components
│   │   ├── services/         # SyncCoordinator, StorageMonitor, etc.
│   │   ├── utils/            # privacy.ts, money.ts, searchUtils.ts, csvParsers.ts
│   │   ├── db/               # IndexedDB (Dexie.js) schema
│   │   └── types/            # TypeScript types (Branded Types: Cents)
│   └── package.json          # Node dependencies
├── menu.ps1                  # Self-Healing orchestration script
└── README.md                 # Este archivo
```

---

## ⚡ Setup Rápido

### Requisitos Previos
- **Python 3.12+** (validado automáticamente por menu.ps1)
- **Node.js 18+**
- **Windows PowerShell** (para menu.ps1)

### Instalación Self-Healing (Un solo comando)

```powershell
# Ejecutar en PowerShell (recomendado como Administrador)
.\menu.ps1
```

**El script `menu.bat` / `menu.ps1` hace todo por ti:**

1. ✅ **Valida Python 3.12+** (aborta si es incompatible)
2. ✅ **Limpia puertos zombies** (mata procesos en 8001/5173)
3. ✅ **Crea entorno virtual** si no existe
4. ✅ **Instala dependencias con uv** (10-100x más rápido que pip)
5. ✅ **Valida integridad del backend** (reinstala si está corrupto)
6. ✅ **Inicia backend** (FastAPI en puerto 8001)
7. ✅ **Health Check Polling** (espera hasta que backend responda)
8. ✅ **Instala dependencias Node** si faltan
9. ✅ **Inicia frontend** (Vite en puerto 5173)
10. ✅ **Abre navegador** automáticamente en `http://localhost:5173`

### Instalación Manual (si prefieres control total)

#### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install uv
uv pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 🔧 Stack Tecnológico

### Backend
- **Python 3.12+** con FastAPI (framework web moderno)
- **SQLite** en modo WAL (Write-Ahead Logging para concurrencia)
- **SQLAlchemy** ORM con Alembic migrations
- **UUIDv5** para identidad determinista
- **Cryptography** para hashing SHA-256

### Frontend
- **React 18** con TypeScript (tipado estático)
- **Vite** (build tool ultrarrápido)
- **Dexie.js** (wrapper de IndexedDB)
- **Decimal.js-light** (precisión monetaria)
- **TailwindCSS** (styling utility-first)
- **Lucide React** (iconos)

---

## 🎯 ¿Por qué Tabula Rasa es diferente?

| Característica | Apps SaaS Comunes | Tabula Rasa |
|---------------|------------------|-------------|
| **Propiedad de datos** | Servidores de terceros | Tu navegador (IndexedDB) |
| **Offline** | Requiere internet | Offline-first completo |
| **Privacidad IA** | Datos crudos a la nube | Zero-Knowledge (sanitizado) |
| **Precisión monetaria** | Float IEEE 754 (errores) | Branded Types + Decimal.js |
| **Conflictos offline** | Sobrescritura silenciosa | FIFO queue + resolución manual |
| **Importación masiva** | Crash >10k registros | Streaming 50k+ sin freeze |
| **Auto-reparación** | Manual | Protocolo Phoenix automático |

---

## 📊 Roadmap

- [ ] **Multi-currency**: Soporte para USD, EUR con conversión en tiempo real
- [ ] **Recurring Transactions**: Automatización de gastos recurrentes
- [ ] **Advanced Analytics**: Plotly integrado para visualizaciones interactivas
- [ ] **Mobile PWA**: Progressive Web App para acceso móvil
- [ ] **Dark Mode**: Toggle de tema claro/oscuro
- [ ] **Export PDF**: Reportes en PDF para contadores

---

## 📄 Licencia

Este proyecto es para uso personal.

---

## 🤝 Contribuciones

Tabula Rasa es un proyecto personal. Sin embargo, el código está documentado extensamente para fines educativos. Si encuentras un bug o tienes una sugerencia, siéntete libre de abrir un issue.
