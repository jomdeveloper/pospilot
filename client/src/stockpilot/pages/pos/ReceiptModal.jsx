import React from "react";
import { Printer } from "lucide-react";
import Button from "../../components/ui/Button";
import { money } from "../../theme";
import { getStoreLogo, getStoreIdentity } from "../../../cashierpos/data/storeConfig";

export default function ReceiptModal({ t, cart, subtotal, tax, total, method, invoiceId, onNewSale }) {
  const identity = getStoreIdentity();
  const logo = getStoreLogo();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="w-full max-w-xs rounded-2xl p-5 font-mono" style={{ background: t.card }}>
        <div className="text-center mb-3">
          {logo && <img src={logo} alt="" className="w-10 h-10 object-contain mx-auto mb-1" />}
          <p className="text-sm font-bold" style={{ color: t.text }}>{identity.name || "Sale Complete"}</p>
          <p className="text-[10px] text-center" style={{ color: t.sub }}>
            {[identity.address, identity.phone].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[10px]" style={{ color: t.sub }}>{invoiceId} · {method.toUpperCase()}</p>
        </div>
        <div className="border-t border-dashed pt-2 space-y-1 text-[11px]" style={{ borderColor: t.border }}>
          {cart.map((i) => (
            <div key={i.id} className="flex justify-between" style={{ color: t.sub }}>
              <span>{i.qty}× {i.name.slice(0, 20)}</span><span style={{ color: t.text }}>{money(i.price * i.qty)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed mt-2 pt-2 text-[11px] space-y-1" style={{ borderColor: t.border }}>
          <div className="flex justify-between" style={{ color: t.sub }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {tax > 0 && <div className="flex justify-between" style={{ color: t.sub }}><span>Tax</span><span>{money(tax)}</span></div>}
          <div className="flex justify-between font-bold text-xs mt-1" style={{ color: t.text }}><span>Total</span><span>{money(total)}</span></div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button t={t} variant="outline" className="flex-1" size="sm"><Printer size={13} /> Print</Button>
          <Button t={t} className="flex-1" size="sm" onClick={onNewSale}>New Sale</Button>
        </div>
      </div>
    </div>
  );
}
