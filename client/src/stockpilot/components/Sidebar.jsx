import React from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { NAV_SECTIONS } from "../data/navigation";

export default function Sidebar({ active, setActive, collapsed, setCollapsed, mobileOpen, onClose, t, role, storeName = "StockPilot", storeLogo }) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(normalizedRole)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/30 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col shrink-0 h-screen transition-transform duration-300 md:relative md:inset-auto md:z-auto md:translate-x-0 md:sticky md:top-0 ${collapsed ? "md:w-[76px]" : "md:w-[264px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{ background: t.card, borderRight: `1px solid ${t.border}` }}
      >
      <div className="flex items-center gap-3 px-5 h-16 shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: t.primary }}>
          {storeLogo ? <img src={storeLogo} alt="" className="w-full h-full object-contain" /> : null}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: t.text, fontFamily: "Manrope, sans-serif" }}>
              {storeName}
            </p>
            <p className="text-[11px] truncate" style={{ color: t.sub }}>
              Inventory & POS
            </p>
          </div>
        )}
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl md:hidden"
          style={{ color: t.sub, background: t.bg }}
        >
          <X size={17} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-1.5 text-[10px] font-bold tracking-wider uppercase" style={{ color: t.sub }}>
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActive(item.id);
                      onClose();
                    }}
                    title={collapsed ? item.label : undefined}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative group"
                    style={{ background: isActive ? t.primarySoft : "transparent", color: isActive ? t.primary : t.sub }}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full" style={{ background: t.primary }} />
                    )}
                    <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 shrink-0" style={{ borderTop: `1px solid ${t.border}` }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium"
          style={{ color: t.sub, background: t.bg }}
        >
          {collapsed ? (
            <ChevronsRight size={16} />
          ) : (
            <>
              <ChevronsLeft size={16} /> Collapse
            </>
          )}
        </button>
      </div>
      </aside>
    </>
  );
}
