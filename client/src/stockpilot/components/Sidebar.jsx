import React from "react";
import { Boxes, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NAV_SECTIONS } from "../data/navigation";

export default function Sidebar({ active, setActive, collapsed, setCollapsed, t }) {
  return (
    <aside
      className="hidden md:flex flex-col shrink-0 transition-all duration-300 h-screen sticky top-0"
      style={{ width: collapsed ? 76 : 264, background: t.card, borderRight: `1px solid ${t.border}` }}
    >
      <div className="flex items-center gap-3 px-5 h-16 shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: t.primary }}>
          <Boxes size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: t.text, fontFamily: "Manrope, sans-serif" }}>
              StockPilot
            </p>
            <p className="text-[11px] truncate" style={{ color: t.sub }}>
              Inventory & POS
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
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
                    onClick={() => setActive(item.id)}
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
  );
}
