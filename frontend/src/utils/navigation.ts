import {
  LayoutDashboard,
  ArrowUpDown,
  Wallet,
  PieChart,
  Target,
  Bell,
  CreditCard,
  Tag,
  Calendar,
  Receipt,
  Settings,
} from "lucide-react";

export const navigationGroups = [
  {
    label: "Día a día",
    items: [
      { path: "/", label: "Resumen", icon: LayoutDashboard },
      { path: "/transactions", label: "Transacciones", icon: ArrowUpDown },
      { path: "/accounts", label: "Cuentas", icon: Wallet },
    ],
  },
  {
    label: "Planificación",
    items: [
      { path: "/budgets", label: "Presupuestos", icon: PieChart },
      { path: "/goals", label: "Metas", icon: Target },
      { path: "/reminders", label: "Recordatorios", icon: Bell },
      { path: "/subscriptions", label: "Suscripciones", icon: CreditCard },
    ],
  },
  {
    label: "Organización",
    items: [
      { path: "/categories", label: "Categorías", icon: Tag },
      { path: "/snapshots", label: "Cierres mensuales", icon: Calendar },
      { path: "/fiscal", label: "Impuestos SRI", icon: Receipt },
    ],
  },
  {
    label: "Preferencias",
    items: [{ path: "/settings", label: "Configuración", icon: Settings }],
  },
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);
export const mobileItems = ["/", "/transactions", "/accounts", "/budgets"].map(
  (path) => navigationItems.find((item) => item.path === path)!,
);
