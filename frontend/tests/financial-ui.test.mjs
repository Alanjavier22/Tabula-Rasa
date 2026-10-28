import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFileSync } from "node:fs";

let server;
let SafeToSpendCard;
let filterTransactions;
let DatePicker;
let ExpenseBreakdownChart;
let navigationItems;
before(async () => {
  server = await createServer({
    cacheDir: "node_modules/.vite-financial-ui-tests",
    server: { middlewareMode: true },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ default: SafeToSpendCard } = await server.ssrLoadModule(
    "/src/components/dashboard/SafeToSpendCard.tsx",
  ));
  ({ filterTransactions } = await server.ssrLoadModule(
    "/src/utils/transactionFilters.ts",
  ));
  ({ default: DatePicker } = await server.ssrLoadModule(
    "/src/components/common/DatePicker.tsx",
  ));
  ({ default: ExpenseBreakdownChart } = await server.ssrLoadModule(
    "/src/components/dashboard/ExpenseBreakdownChart.tsx",
  ));
  ({ navigationItems } = await server.ssrLoadModule(
    "/src/utils/navigation.ts",
  ));
});
after(async () => {
  await server?.close();
});

const data = {
  safe_to_spend: 10000,
  current_balance: 20000,
  monthly_income: 0,
  projected_fixed_expenses: 10000,
  actual_expenses: 0,
  pending_cc_payments: 0,
  pending_debt_shares: 0,
  safe_to_spend_buffer: 0,
  anomaly_leaks: 0,
  projected_taxes: 0,
  breakdown: {
    subscriptions: 10000,
    ious: 0,
    credit_cards: 0,
    debt_shares: 0,
    seasonal: 0,
  },
};
const render = (props) =>
  renderToStaticMarkup(createElement(SafeToSpendCard, props));

test("un déficit conserva el signo y nunca se presenta como saldo saludable", () => {
  const html = render({ data: { ...data, safe_to_spend: -12550 } });
  assert.match(html, /Saldo proyectado negativo/);
  assert.match(html, /−\$ 125\.50/);
  assert.doesNotMatch(html, /saludable|Margen proyectado disponible/);
});

test("el saldo cero informa que no queda margen para nuevos gastos", () => {
  assert.match(
    render({ data: { ...data, safe_to_spend: 0 } }),
    /Sin margen disponible/,
  );
});

test("los Decimal serializados por FastAPI se muestran sin perder centavos", () => {
  const html = render({ data: { ...data, safe_to_spend: "12345" } });
  assert.match(html, /\$ 123\.45/);
  assert.match(html, /Margen proyectado disponible/);
  assert.match(html, /30 días/);
  assert.doesNotMatch(html, /Uso del presupuesto|En rango saludable/);
});

test("una estimación ausente o inválida ofrece recuperación sin inventar un cero", () => {
  for (const amount of [undefined, null, "", " ", "no disponible", Infinity]) {
    const html = render({
      data: { ...data, safe_to_spend: amount },
      onRetry: () => {},
    });
    assert.match(html, /No se pudo obtener la estimación/);
    assert.match(html, /Reintentar/);
    assert.doesNotMatch(html, /\$ 0\.00|Margen proyectado disponible/);
  }
});

test("una actualización fallida identifica el dato anterior y permite reintentar", () => {
  const html = render({ data, hasError: true, onRetry: () => {} });
  assert.match(html, /última estimación disponible/);
  assert.match(html, /Reintentar/);
  assert.match(html, /\$ 100\.00/);
});

test("la carga inicial comunica progreso sin mostrar un saldo provisional", () => {
  const html = render({ isLoading: true, isFetching: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Calculando tu disponible/);
  assert.doesNotMatch(html, /\$ 0\.00|Reintentar/);
});

const transactions = [
  {
    id: "1",
    date: "2026-10-28T23:59:59Z",
    description: "Pago mensual",
    beneficiary: "Proveedor Álvarez",
    category_id: "comida",
    account_id: "banco",
  },
  {
    id: "2",
    date: "2026-10-29T00:00:00Z",
    description: "Compra",
    beneficiary: "",
    category_id: "comida",
    account_id: "efectivo",
  },
];

test("la fecha final incluye todos los movimientos del día seleccionado", () => {
  assert.deepEqual(
    filterTransactions(transactions, "", "2026-10-28", "2026-10-28").map(
      (item) => item.id,
    ),
    ["1"],
  );
});

test("búsqueda por beneficiario y filtros por cuenta y categoría se combinan", () => {
  assert.deepEqual(
    filterTransactions(
      transactions,
      " ÁLVAREZ ",
      "",
      "",
      "comida",
      "banco",
    ).map((item) => item.id),
    ["1"],
  );
  assert.equal(
    filterTransactions(transactions, "ÁLVAREZ", "", "", "comida", "efectivo")
      .length,
    0,
  );
});

test("limpiar filtros recupera todos los movimientos sin modificar el origen", () => {
  const original = JSON.stringify(transactions);
  filterTransactions(transactions, "sin coincidencias", "", "");
  assert.equal(filterTransactions(transactions, "", "", "").length, 2);
  assert.equal(JSON.stringify(transactions), original);
});

test("el calendario conserva el día de la transacción sin conversión horaria", () => {
  const html = renderToStaticMarkup(
    createElement(DatePicker, {
      value: "2026-10-28T00:00:00Z",
      onChange: () => {},
      placeholder: "Fecha del movimiento",
    }),
  );
  assert.match(html, /value="2026-10-28"/);
  assert.match(html, /aria-label="Fecha del movimiento"/);
});

test("las categorías se ordenan por importe y conservan valores Decimal legibles", () => {
  const items = [
    { name: "Transporte", value: "1250" },
    { name: "Alimentos", value: "2500" },
  ];
  const html = renderToStaticMarkup(
    createElement(ExpenseBreakdownChart, {
      dashboardSummary: {},
      expenseBreakdown: items,
    }),
  );
  assert.ok(html.indexOf("Alimentos") < html.indexOf("Transporte"));
  assert.match(html, /\$ 25\.00/);
  assert.match(html, /67%/);
  assert.equal(items[0].name, "Transporte");
});

test("todas las secciones siguen disponibles desde la navegación compartida", () => {
  const paths = navigationItems.map((item) => item.path);
  assert.equal(new Set(paths).size, 11);
  for (const path of [
    "/",
    "/transactions",
    "/accounts",
    "/budgets",
    "/goals",
    "/reminders",
    "/subscriptions",
    "/categories",
    "/snapshots",
    "/fiscal",
    "/settings",
  ])
    assert.ok(paths.includes(path));
  assert.equal(
    navigationItems.find((item) => item.path === "/snapshots").label,
    "Cierres mensuales",
  );
});

test("los textos de ambos temas conservan contraste AA en las superficies principales", () => {
  const css = readFileSync(
    new URL("../src/index.css", import.meta.url),
    "utf8",
  );
  const luminance = (hex) => {
    const rgb = [1, 3, 5]
      .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const selector of [/:root \{([^}]+)/, /body.dark \{([^}]+)/]) {
    const tokens = Object.fromEntries(
      [
        ...css.match(selector)[1].matchAll(/--app-([\w-]+): (#[\da-f]{6});/gi),
      ].map((match) => [match[1], match[2]]),
    );
    for (const background of ["surface", "surface-soft", "surface-strong"]) {
      for (const foreground of ["text", "muted", "subtle"]) {
        const [low, high] = [
          luminance(tokens[foreground]),
          luminance(tokens[background]),
        ].sort((a, b) => a - b);
        assert.ok(
          (high + 0.05) / (low + 0.05) >= 4.5,
          `${foreground} sobre ${background} debe cumplir AA`,
        );
      }
    }
  }
});
