# Sistema de interfaz de Tabula Rasa

La aplicación es una herramienta personal de finanzas local. La interfaz prioriza completar tareas, comparar importes y distinguir datos reales de estimaciones. Conserva los temas claro y oscuro y el acento violeta existente.

## Tokens y componentes

- `src/index.css` define los tokens `--app-*` de ambos temas. Tailwind expone `canvas`, `surface`, `surface-soft`, `primary`, `muted`, `line`, `accent-strong` y los estados semánticos. No recrear colores de tema con utilidades Slate, blanco con opacidad ni selectores globales sobre fragmentos de `class`.
- Usar `app-btn` y `app-btn-primary` para acciones. Reservar una acción principal por cabecera; agrupar operaciones secundarias en `app-action-menu`.
- Usar `Modal` para formularios que requieren foco protegido. Montarlo solo mientras esté abierto. Proporcionar un nombre accesible y una salida con Escape; el componente restaura el foco y bloquea el fondo. No manipular el scroll del body desde la página que lo contiene.
- Usar `Select` para listas con búsqueda y `DatePicker` para fechas de calendario. Cada campo debe tener `label` e `id` asociados. Las fechas `YYYY-MM-DD` no pasan por `new Date()` ni `toISOString()` para decidir el día.
- Usar `ConfirmDialog` para confirmar eliminaciones. La primera opción enfocada es Cancelar. No probar eliminaciones con los datos financieros del usuario.
- Los avisos de error y advertencia permanecen hasta cerrarlos por defecto. Los errores de formularios también aparecen junto al contenido y conservan los datos introducidos.

## Jerarquía y contenido

- El resumen muestra disponible, indicadores, próximos pagos y movimientos recientes. Tarjetas, deudas, tendencias e IA usan divulgación progresiva. Los gráficos se cargan al abrir su sección.
- `src/utils/navigation.ts` es la fuente compartida de rutas para la navegación y la paleta de comandos. Se agrupan en Día a día, Planificación, Organización y Preferencias.
- Usar «Cierres mensuales», «Reserva de seguridad», «Disponible para gastar», «Asistente IA» y «Respaldos» en textos de producto. Conservar identificadores de API y modelos existentes.
- El disponible representa una proyección de 30 días. No llamarlo presupuesto ni presentarlo como una garantía de salud financiera. Distinguir saldo positivo, cero, negativo, carga, error y datos anteriores.
- Los importes de API están en centavos y pueden llegar como strings Decimal. Usar `formatMoney` y las utilidades monetarias; no concatenar números y strings.
- Los gráficos deben incluir valores legibles o una tabla equivalente. Las categorías de gasto se ordenan por importe. No depender únicamente del color para expresar ingreso, gasto o alerta.

## Diseño adaptable y accesibilidad

- Mantener los tokens de texto con contraste mínimo AA en las superficies del sistema. Los colores personalizados de categorías se conservan como identificación visual, sin utilizarlos como único color de texto.
- Los botones de formularios y acciones de filas deben ofrecer objetivos de 44 px. Mantener visibles foco, estados de carga y confirmaciones.
- La lista de transacciones conserva virtualización, filas de 132 px, metadatos resumidos y nombres completos en edición. Al filtrar se reinicia la ventana; el fin del rango incluye el día completo.
- Verificar ventanas de 390 y 1280 px, ambos temas y teclado. Un viewport emulado no demuestra interacción táctil ni una prueba con lector de pantalla real.
- Evitar partículas, halos, texturas, texto con degradado y entradas animadas por cada sección. `MotionConfig` respeta la preferencia de movimiento reducido.

## Validación

`npm test`, `npm run lint -- --max-warnings 0` y `npm run build`. Las pruebas de interfaz usan Vite SSR con caché separada de desarrollo y no llaman al backend ni a Gemini. Las pruebas de navegador no deben guardar, importar, cerrar meses, restaurar respaldos ni eliminar datos reales.

El detector de Impeccable mantiene avisos estilísticos por la familia Inter existente y por los bordes de un spinner circular del escáner. Se conservan la tipografía del producto y el indicador de carga; esos bordes no son un acento lateral en una tarjeta.
