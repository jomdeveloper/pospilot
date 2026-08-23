import React from "react";
import { Search, Bell, Moon, Sun, ChevronDown, LogOut } from "lucide-react";
import { PAGE_TITLES } from "../data/navigation";

export default function Topbar({ page, dark, setDark, t, username, role, onLogout }) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const displayName = username || "Admin";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 h-16 px-4 md:px-7 shrink-0"
      style={{ background: t.card, borderBottom: `1px solid ${t.border}` }}
    >
      <div className="min-w-0 hidden sm:block">
        <p className="text-[11px] font-medium" style={{ color: t.sub }}>
          StockPilot / <span style={{ color: t.text }}>{PAGE_TITLES[page]}</span>
        </p>
        <h1 className="text-base font-bold truncate" style={{ color: t.text, fontFamily: "Manrope, sans-serif" }}>
          {PAGE_TITLES[page]}
        </h1>
      </div>

      <div className="flex-1 max-w-md ml-0 sm:ml-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} />
          <input
            placeholder="Search products, invoices, suppliers…"
            className="w-full pl-9 pr-16 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
          />
          <kbd
            className="hidden lg:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: t.card, color: t.sub, border: `1px solid ${t.border}` }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button onClick={() => setDark(!dark)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: t.bg, color: t.sub }}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="w-9 h-9 rounded-xl flex items-center justify-center relative" style={{ background: t.bg, color: t.sub }}>
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: t.danger }} />
        </button>
        <div className="w-px h-6 mx-1" style={{ background: t.border }} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl"
            style={{ background: t.bg }}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: t.primary }}>
              {initials}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-semibold leading-tight" style={{ color: t.text }}>{displayName}</p>
              <p className="text-[10px] leading-tight" style={{ color: t.sub }}>{role || "User"}</p>
            </div>
            <ChevronDown size={14} style={{ color: t.sub }} />
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-xl p-2 z-30"
              style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: "0 12px 30px rgba(15,23,42,0.14)" }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: t.border }}>
                <p className="text-xs font-semibold" style={{ color: t.text }}>{displayName}</p>
                <p className="text-[11px]" style={{ color: t.sub }}>{role || "User"} account</p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-lg text-xs font-semibold"
                style={{ color: t.danger }}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
