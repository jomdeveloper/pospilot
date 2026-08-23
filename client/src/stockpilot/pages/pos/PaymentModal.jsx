import React from "react";
import { X, Wallet, CreditCard, Smartphone, Landmark } from "lucide-react";
import Button from "../../components/ui/Button";
import { money } from "../../theme";

const PAYMENT_OPTIONS = [
  { id: "cash", label: "Cash", icon: Wallet },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "gcash", label: "GCash", icon: Smartphone },
  { id: "bank", label: "Bank Transfer", icon: Landmark },
];

export default function PaymentModal({ t, method, setMethod, total, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: t.card }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: t.text }}>Select Payment</h3>
          <button onClick={onClose} style={{ color: t.sub }}><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {PAYMENT_OPTIONS.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button key={m.id} onClick={() => setMethod(m.id)} className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold"
                style={{ background: active ? t.primarySoft : t.bg, color: active ? t.primary : t.sub, border: `1px solid ${active ? t.primary : t.border}` }}>
                <Icon size={18} /> {m.label}
              </button>
            );
          })}
        </div>
        <div className="rounded-xl px-4 py-3 flex items-center justify-between mb-4" style={{ background: t.bg }}>
          <span className="text-xs font-semibold" style={{ color: t.sub }}>Amount Due</span>
          <span className="font-extrabold" style={{ color: t.text }}>{money(total)}</span>
        </div>
        <Button t={t} className="w-full" size="lg" onClick={onConfirm}>Confirm Payment</Button>
      </div>
    </div>
  );
}
