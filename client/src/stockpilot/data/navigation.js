import {
  LayoutDashboard, Package, Boxes, Tags, Truck, Users,
  ClipboardList, ArrowLeftRight, SlidersHorizontal, Repeat, Store,
  Receipt, RotateCcw, BarChart3, UserCog, ShieldCheck, Settings,
  PackageCheck, FileCheck2,
} from "lucide-react";

export const NAV_SECTIONS = [
  { label: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Catalog",
    items: [
      { id: "products", label: "Products", icon: Package, roles: ["administrator", "admin", "manager"] },
      { id: "inventory", label: "Inventory", icon: Boxes, roles: ["administrator", "admin", "manager", "inventory clerk", "pharmacist"] },
      { id: "categories", label: "Categories", icon: Tags, roles: ["administrator", "admin", "manager", "pharmacist"] },
      { id: "suppliers", label: "Suppliers", icon: Truck, roles: ["administrator", "admin", "manager", "inventory clerk"] },
      { id: "customers", label: "Customers", icon: Users, roles: ["administrator", "admin", "manager", "cashier", "pharmacist"] },
    ],
  },
  {
    label: "Procurement",
    items: [
      { id: "purchases", label: "Purchases", icon: ClipboardList, roles: ["administrator", "admin", "manager", "inventory clerk"] },
      { id: "receiving", label: "Receiving", icon: PackageCheck, roles: ["administrator", "admin", "manager", "inventory clerk"] },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { id: "movement", label: "Stock Movement", icon: ArrowLeftRight, roles: ["administrator", "admin", "manager", "inventory clerk", "pharmacist", "auditor"] },
      { id: "adjustment", label: "Stock Adjustment", icon: SlidersHorizontal, roles: ["administrator", "admin", "manager", "inventory clerk", "pharmacist"] },
      { id: "transfers", label: "Transfers", icon: Repeat, roles: ["administrator", "admin", "manager", "inventory clerk"] },
    ],
  },
  {
    label: "Selling",
    items: [
      { id: "pos", label: "Point of Sale", icon: Store, roles: ["administrator", "admin", "manager", "cashier"] },
      { id: "sales", label: "Sales", icon: Receipt, roles: ["administrator", "admin", "manager", "cashier", "auditor"] },
      { id: "returns", label: "Returns", icon: RotateCcw, roles: ["administrator", "admin", "manager", "cashier"] },
    ],
  },
  {
    label: "System",
    items: [
      { id: "reports", label: "Reports", icon: BarChart3 },
      { id: "users", label: "Users", icon: UserCog, roles: ["administrator", "admin"] },
      { id: "approvals", label: "Approvals", icon: FileCheck2, roles: ["administrator", "admin", "manager"] },
      { id: "audit", label: "Audit Logs", icon: ShieldCheck, roles: ["administrator", "admin", "auditor"] },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export const PAGE_TITLES = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items).map((item) => [item.id, item.label])
);
