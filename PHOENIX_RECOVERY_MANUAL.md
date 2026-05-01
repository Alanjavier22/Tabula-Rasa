# Protocolo Phoenix - Manual de Recuperación de Emergencia

## 📋 Resumen
El Protocolo Phoenix es un sistema de auto-reparación de esquema para IndexedDB que detecta corrupciones de base de datos y ejecuta un hard reset cuando es necesario. Como última medida de seguridad, exporta un JSON de emergencia a `localStorage` antes de borrar la base de datos.

## 🔧 Componentes

### 1. Detección de Corrupción
El sistema detecta errores de esquema en tres capas:
- **Global Error Boundary** (`GlobalErrorBoundary.tsx`): Captura errores de React
- **Global Unhandled Rejection** (`main.tsx`): Captura promesas rechazadas de Dexie
- **Panic Counter** (`db.ts`): Cuenta fallos consecutivos en ventana de tiempo (5 minutos)

### 2. JSON de Emergencia
Antes de borrar IndexedDB, el sistema exporta:
- `transactions` - Todas las transacciones
- `accounts` - Todas las cuentas
- `categories` - Todas las categorías
- `budgets` - Todos los presupuestos
- `subscriptions` - Todas las suscripciones
- `ious` - Todos los préstamos
- `net_worth_snapshots` - Todos los snapshots de patrimonio

**Ubicación:** `localStorage.getItem('phoenix_emergency_backup')`

## 🚨 Procedimiento de Recuperación

### Paso 1: Verificar si existe respaldo de emergencia
Abre la consola del navegador y ejecuta:
```javascript
const backup = localStorage.getItem('phoenix_emergency_backup');
if (backup) {
  console.log('Backup encontrado:', JSON.parse(backup));
} else {
  console.log('No existe backup de emergencia');
}
```

### Paso 2: Decodificar el respaldo
```javascript
const backup = JSON.parse(localStorage.getItem('phoenix_emergency_backup'));
console.log('Timestamp:', backup.timestamp);
console.log('Versión:', backup.version);
console.log('Tablas exportadas:', Object.keys(backup.tables));
```

### Paso 3: Restaurar datos manualmente
Si el respaldo existe, puedes restaurar los datos manualmente usando la API del backend:

```javascript
// Ejemplo: Restaurar transacciones
const backup = JSON.parse(localStorage.getItem('phoenix_emergency_backup'));
const transactions = backup.tables.transactions;

// Enviar al backend para restauración
fetch('http://localhost:8001/api/transactions/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ transactions })
});
```

### Paso 4: Limpiar localStorage (opcional)
Después de una recuperación exitosa:
```javascript
localStorage.removeItem('phoenix_emergency_backup');
```

## ⚠️ Limitaciones

1. **Tamaño de localStorage**: Limitado a ~5MB. Si la base de datos es muy grande, el export puede fallar.
2. **No incluye todos los datos**: Solo exporta tablas críticas. No incluye `sync_queue`, `sync_errors`, `ai_cache`, etc.
3. **Sin garantía de integridad**: El respaldo se crea en un estado de corrupción - puede contener datos inconsistentes.

## 🔄 Flujo Completo

```
Error de Dexie detectado
    ↓
Panic Counter incrementa (ventana 5 min)
    ↓
¿Panic Counter ≥ 3?
    ↓ Sí
phoenixHardReset() ejecutado
    ↓
Exportar JSON a localStorage (emergency backup)
    ↓
Borrar IndexedDB
    ↓
Recargar página
    ↓
IndexedDB recreada con esquema limpio
```

## 📞 Soporte
Si la recuperación manual falla, contacta al desarrollador con:
- Timestamp del respaldo
- Versión del esquema
- Captura de pantalla de la consola
- Contenido de `phoenix_emergency_backup`
