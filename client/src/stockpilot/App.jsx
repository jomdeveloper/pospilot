import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import ProductsPage from "./pages/Products";
import InventoryPage from "./pages/Inventory";
import POSPage from "./pages/POS";
import UsersPage from "./pages/Users";
import PurchasesPage from "./pages/Purchases";
import ReceivingPage from "./pages/Receiving";
import CategoriesPage from "./pages/Categories";
import SuppliersPage from "./pages/Suppliers";
import CustomersPage from "./pages/Customers";
import ComingSoonPage from "./pages/ComingSoon";
import AuditLogsPage from "./pages/AuditLogs";
import { C, DARK } from "./theme";
import "./index.css";

export default function StockPilotApp({ loggedInUser, loggedInRole, sessionToken, onLogout }) {
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const t = dark ? DARK : C;

  React.useEffect(() => {
    document.body.classList.add("stockpilot-body");
    return () => document.body.classList.remove("stockpilot-body");
  }, []);

  const renderPage = () => {
    switch (active) {
      case "dashboard": return <Dashboard t={t} />;
      case "products": return <ProductsPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "inventory": return <InventoryPage t={t} />;
      case "pos": return <POSPage t={t} />;
      case "users": return <UsersPage t={t} sessionToken={sessionToken} canCreateUsers={loggedInRole === "Administrator"} />;
      case "purchases": return <PurchasesPage t={t} />;
      case "receiving": return <ReceivingPage t={t} />;
      case "categories": return <CategoriesPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "suppliers": return <SuppliersPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "customers": return <CustomersPage t={t} />;
      case "audit": return <AuditLogsPage t={t} sessionToken={sessionToken} />;
      default: return <ComingSoonPage page={active} t={t} />;
    }
  };

  return (
    <div className="stockpilot-shell flex" style={{ background: t.bg, fontFamily: "Inter, sans-serif", minHeight: "100vh" }}>
      <Sidebar active={active} setActive={setActive} collapsed={collapsed} setCollapsed={setCollapsed} t={t} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar page={active} dark={dark} setDark={setDark} t={t} username={loggedInUser} role={loggedInRole} onLogout={onLogout} />
        <main className="flex-1 p-4 md:p-7">{renderPage()}</main>
      </div>
    </div>
  );
}
