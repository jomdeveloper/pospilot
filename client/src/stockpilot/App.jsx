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
import ApprovalsPage from "./pages/Approvals";
import StockMovementsPage from "./pages/StockMovements";
import StockAdjustmentPage from "./pages/StockAdjustment";
import TransfersPage from "./pages/Transfers";
import SalesPage from "./pages/Sales";
import ReturnsPage from "./pages/Returns";
import ReportsPage from "./pages/Reports";
import SettingsPage from "./pages/Settings";
import { C, DARK } from "./theme";
import { getStoreLogo, useStoreSettings } from "./settings";
import "./index.css";

export default function StockPilotApp({ loggedInUser, loggedInRole, sessionToken, onLogout }) {
  const storeSettings = useStoreSettings();
  const storeName = storeSettings.storeName || "StockPilot";
  const storeLogo = getStoreLogo(storeSettings);
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const t = dark ? DARK : C;
  const normalizedRole = String(loggedInRole || "").trim().toLowerCase();
  const canManageUsers = ["administrator", "admin"].includes(normalizedRole);

  React.useEffect(() => {
    document.body.classList.add("stockpilot-body");
    return () => document.body.classList.remove("stockpilot-body");
  }, []);

  const renderPage = () => {
    switch (active) {
      case "dashboard": return <Dashboard t={t} />;
      case "products": return <ProductsPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "inventory": return <InventoryPage t={t} />;
      case "movement": return <StockMovementsPage t={t} />;
      case "adjustment": return <StockAdjustmentPage t={t} sessionToken={sessionToken} />;
      case "transfers": return <TransfersPage t={t} sessionToken={sessionToken} />;
      case "pos": return <POSPage t={t} sessionToken={sessionToken} />;
      case "sales": return <SalesPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "returns": return <ReturnsPage t={t} sessionToken={sessionToken} />;
      case "reports": return <ReportsPage t={t} />;
      case "settings": return <SettingsPage t={t} sessionToken={sessionToken} />;
      case "users": return <UsersPage t={t} sessionToken={sessionToken} canManageUsers={canManageUsers} />;
      case "purchases": return <PurchasesPage t={t} />;
      case "receiving": return <ReceivingPage t={t} />;
      case "categories": return <CategoriesPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "suppliers": return <SuppliersPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "customers": return <CustomersPage t={t} />;
      case "approvals": return <ApprovalsPage t={t} sessionToken={sessionToken} loggedInRole={loggedInRole} />;
      case "audit": return <AuditLogsPage t={t} sessionToken={sessionToken} />;
      default: return <ComingSoonPage page={active} t={t} />;
    }
  };

  return (
    <div className="stockpilot-shell flex" style={{ background: t.bg, fontFamily: "Inter, sans-serif", minHeight: "100vh" }}>
      <Sidebar
        active={active}
        setActive={setActive}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        t={t}
        role={loggedInRole}
        storeName={storeName}
        storeLogo={storeLogo}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          page={active}
          dark={dark}
          setDark={setDark}
          t={t}
          username={loggedInUser}
          role={loggedInRole}
          onLogout={onLogout}
          onMenuClick={() => setMobileSidebarOpen(true)}
        />
        <main className="flex-1 p-4 md:p-7">{renderPage()}</main>
      </div>
    </div>
  );
}
