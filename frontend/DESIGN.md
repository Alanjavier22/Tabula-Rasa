# Sistema de interfaz de Tabula Rasa

La aplicación es una herramienta personal de finanzas local. La dirección visual elegida es **Lectura anotada**: papel cálido, tinta oscura, tipografía editorial para titulares e importes, reglas finas y acentos terracota que señalan la lectura del dato. La interfaz prioriza completar tareas, comparar importes y distinguir datos reales de estimaciones. El modo oscuro conserva el carácter cálido con fondos grafito y acentos suaves.

## Tokens y componentes

- `src/index.css` define los tokens `--app-*` de ambos temas. Tailwind expone `canvas`, `surface`, `surface-soft`, `primary`, `muted`, `line`, `accent-strong` y los estados semánticos. Usar terracota como marca de atención, verde para resultados positivos y rojo para riesgos. No recrear colores de tema con utilidades Slate, blanco con opacidad ni selectores globales sobre fragmentos de `class`.
- Usar `app-btn` y `app-btn-primary` para acciones. Reservar una acción principal por cabecera; agrupar operaciones secundarias en `app-action-menu`.
- Usar `Modal` para formularios que requieren foco protegido. Montarlo solo mientras esté abierto. Proporcionar un nombre accesible y una salida con Escape; el componente restaura el foco y bloquea el fondo. No manipular el scroll del body desde la página que lo contiene.
- Usar `Select` para listas con búsqueda y `DatePicker` para fechas de calendario. Cada campo debe tener `label` e `id` asociados. Las fechas `YYYY-MM-DD` no pasan por `new Date()` ni `toISOString()` para decidir el día.
- Usar `ConfirmDialog` para confirmar eliminaciones. La primera opción enfocada es Cancelar. No probar eliminaciones con los datos financieros del usuario.
- Los avisos de error y advertencia permanecen hasta cerrarlos por defecto. Los errores de formularios también aparecen junto al contenido y conservan los datos introducidos.

## Jerarquía y contenido

- El resumen muestra disponible, indicadores, próximos pagos y movimientos recientes. Tarjetas, deudas, tendencias e IA usan divulgación progresiva. Los gráficos se cargan al abrir su sección.
- `src/utils/navigation.ts` es la fuente compartida de rutas para la navegación y la paleta de comandos. Se agrupan en Día a día, Planificación, Organización y Preferencias.
- Usar «Cierres mensuales», «Reserva de seguridad», «Disponible para gastar», «Asistente IA» y «Respaldos» en textos de producto. Conservar identificadores de API y modelos existentes.
- Los once módulos comparten un titular editorial del mismo tamaño y peso. Las acciones se escriben en estilo oración; las mayúsculas sostenidas quedan para etiquetas cortas de datos.
- El disponible representa una proyección de 30 días. No llamarlo presupuesto ni presentarlo como una garantía de salud financiera. Distinguir saldo positivo, cero, negativo, carga, error y datos anteriores.
- Los importes de API están en centavos y pueden llegar como strings Decimal. Usar `formatMoney` y las utilidades monetarias; no concatenar números y strings.
- Los gráficos deben incluir valores legibles o una tabla equivalente. Las categorías de gasto se ordenan por importe. No depender únicamente del color para expresar ingreso, gasto o alerta.

## Escritorio y accesibilidad

- Mantener los tokens de texto con contraste mínimo AA en las superficies del sistema. Los colores personalizados de categorías se conservan como identificación visual, sin utilizarlos como único color de texto.
- Los botones de formularios y acciones de filas deben ofrecer objetivos de 44 px. Mantener visibles foco, estados de carga y confirmaciones.
- Las acciones de cuenta y categoría permanecen visibles y conservan el área de 44 px; no depender del hover para descubrir editar o eliminar.
- La revisión financiera se abre como panel lateral contextual. Debe distinguir el índice determinístico de la explicación que puede redactar la IA, y comunicar datos incompletos como conciliación parcial o pendiente.
- El módulo fiscal usa la misma escala de titulares, reglas y colores semánticos de ambos temas. Sus gráficos y acciones no usan degradados decorativos, sombras profundas ni texto blanco sobre superficies suaves.
- La lista de transacciones conserva virtualización, filas de 132 px, metadatos resumidos y nombres completos en edición. Al filtrar se reinicia la ventana; el fin del rango incluye el día completo.
- El producto se diseña para web de escritorio, con ancho de trabajo mínimo de 980 px. Verificar ventanas de escritorio y alturas reducidas, ambos temas y teclado. Configuración permanece fija al pie del lateral; la navegación puede desplazarse si falta altura, sin recortar opciones.
- El estilo editorial usa superficies tranquilas, líneas finas y notas de contexto junto al dato. Reservar la tipografía serif para titulares y cifras destacadas; el cuerpo y los controles conservan una sans legible.
- Evitar partículas, halos, texturas, texto con degradado y entradas animadas por cada sección. Usar transiciones breves para estados de interacción. `MotionConfig` respeta la preferencia de movimiento reducido.

## Validación

`npm test`, `npm run lint -- --max-warnings 0` y `npm run build`. Las pruebas de interfaz usan Vite SSR con caché separada de desarrollo y no llaman al backend ni a Gemini. Las pruebas de navegador no deben guardar, importar, cerrar meses, restaurar respaldos ni eliminar datos reales.

El detector de Impeccable mantiene avisos estilísticos por la familia Inter existente y por los bordes de un spinner circular del escáner. Se conservan la tipografía del producto y el indicador de carga; esos bordes no son un acento lateral en una tarjeta.


## Evaluación de referencias locales

- Impeccable aporta un método de crítica, accesibilidad y pulido; su revisión debe contrastarse con la interfaz real y las tareas financieras, no limitarse a aplicar una estética. El acceso y panel del Centinela priorizan ahora etiquetas comprensibles, jerarquía y recuperación de errores.
- React Bits: `AnimatedList` ofrece navegación por teclado y opciones de presentación, pero su área de desplazamiento y dependencias no resuelven la lista extensa de transacciones. Se conserva una lista virtual adaptada al desplazamiento de la página. Su licencia MIT con Commons Clause permite incorporarlo a aplicaciones, pero restringe redistribuir los componentes como producto independiente.
- Magic UI: `AnimatedList` revela elementos secuencialmente; `NumberTicker` interpola cifras y `BlurFade` oculta contenido durante la entrada. No se aplican a movimientos ni saldos porque retrasar o animar valores puede dificultar su lectura. `ScrollProgress` se basa en el scroll de ventana, mientras escritorio usa un contenedor propio. Su licencia es MIT. Estas referencias se evaluaron sin copiar código ni añadir dependencias.

El modo claro es el valor inicial. La migración `editorial-light-v1` adopta ese valor una vez para preferencias antiguas; después se conserva la selección explícita del usuario. El resumen muestra proyección y disponible en columnas, seguidos por pagos y movimientos.


## Componentes compartidos y cascada

- Modal utiliza dialog nativo. FormModalFrame conserva la animación y estructura de los formularios compactos; FormActions unifica cancelación y guardado; ImportResult presenta el resultado como estado accesible.
- ActionMenu conserva el cierre con Escape y devuelve el foco al resumen del menú.
- Los estilos definen una sola regla por selector y contexto. Resolver conflictos mediante orden de variantes y especificidad contextual; conservar los ajustes de movimiento reducido.
- chartFormatters comparte nombres de meses e importes entre las gráficas.
