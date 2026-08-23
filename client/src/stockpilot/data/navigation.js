import {
  LayoutDashboard, Package, Boxes, Tags, Truck, Users,
  ClipboardList, ArrowLeftRight, SlidersHorizontal, Repeat, Store,
  Receipt, RotateCcw, BarChart3, UserCog, ShieldCheck, Settings,
  PackageCheck,
} from "lucide-react";

export const NAV_SECTIONS = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Catalog",
    items: [
      { id: "products", label: "Products", icon: Package },
      { id: "inventory", label: "Inventory", icon: Boxes },
      { id: "categories", label: "Categories", icon: Tags },
      { id: "suppliers", label: "Suppliers", icon: Truck },
      { id: "customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Procurement",
    items: [
      { id: "purchases", label: "Purchases", icon: ClipboardList },
      { id: "receiving", label: "Receiving", icon: PackageCheck },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { id: "movement", label: "Stock Movement", icon: ArrowLeftRight },
      { id: "adjustment", label: "Stock Adjustment", icon: SlidersHorizontal },
      { id: "transfers", label: "Transfers", icon: Repeat },
    ],
  },
  {
    label: "Selling",
    items: [
      { id: "pos", label: "Point of Sale", icon: Store },
      { id: "sales", label: "Sales", icon: Receipt },
      { id: "returns", label: "Returns", icon: RotateCcw },
    ],
  },
  {
    label: "System",
    items: [
      { id: "reports", label: "Reports", icon: BarChart3 },
      { id: "users", label: "Users", icon: UserCog },
      { id: "audit", label: "Audit Logs", icon: ShieldCheck },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export const PAGE_TITLES = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items).map((item) => [item.id, item.label])
);
