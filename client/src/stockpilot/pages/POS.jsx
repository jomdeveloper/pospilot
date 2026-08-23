import React, { useState, useMemo, useEffect } from "react";
import { ScanLine, ShoppingCart, Minus, Plus, Trash2, CreditCard } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import PaymentModal from "./pos/PaymentModal";
import ReceiptModal from "./pos/ReceiptModal";
import { getProducts } from "../api/products";
import { createSale } from "../api/sales";
import { money } from "../theme";

export default function POSPage({ t }) {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [cart, setCart] = useState([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("cash");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState("");

  useEffect(() => { getProducts().then(setProducts); }, []);

  const filtered = useMemo(() => products.filter((p) => {
    const matchQ = (p.name + p.brand + p.barcode).toLowerCase().includes(query.toLowerCase());
    const matchCat = catFilter === "all" || p.cat === catFilter;
    return matchQ && matchCat && p.stock > 0;
  }), [products, query, catFilter]);

  const addToCart = (p) => {
    setCart((prev) => {
      const found = prev.find((i) => i.id === p.id);
      if (found) {
        if (found.qty >= p.stock) return prev;
        return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...p, qty: 1 }];
    });
  };
  const setQty = (id, qty) => setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(qty, i.stock)) } : i)));
  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = subtotal * (discountPct / 100);
  const taxable = subtotal - discount;
  const tax = taxable * 0.12;
  const total = taxable + tax;

  const completeSale = async () => {
    const sale = await createSale({ items: cart, subtotal, discount, tax, total, method });
    setInvoiceId(sale.id);
    setPayOpen(false);
    setReceiptOpen(true);
  };
  const newSale = () => { setCart([]); setDiscountPct(0); setReceiptOpen(false); setMethod("cash"); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Card t={t} className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <ScanLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Scan barcode or search product…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
            </div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
              <option value="all">All categories</option>
              {[...new Set(products.map((product) => product.category).filter(Boolean))].map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => addToCart(p)} className="text-left rounded-2xl p-3 transition-transform hover:-translate-y-0.5"
              style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <div className="w-full aspect-square rounded-xl flex items-center justify-center text-3xl mb-2" style={{ background: t.bg }}>{p.img}</div>
              <p className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: t.text }}>{p.name}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-sm font-extrabold" style={{ color: t.primary }}>{money(p.price)}</span>
                <span className="text-[10px] font-medium" style={{ color: p.stock <= p.min ? t.warning : t.sub }}>{p.stock} left</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16" style={{ color: t.sub }}>No products match your search.</div>
          )}
        </div>
      </div>

      <Card t={t} className="p-0 sticky top-20 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px dashed ${t.border}` }}>
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} style={{ color: t.primary }} />
            <h3 className="font-bold text-sm" style={{ color: t.text }}>Current Sale</h3>
          </div>
          <Badge t={t} tone="info">{cart.reduce((s, i) => s + i.qty, 0)} items</Badge>
        </div>

        <div className="px-5 py-3">
          <select className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
            <option>Walk-in Customer</option>
            <option>Josefina Dela Cruz</option>
            <option>Roberto Aquino</option>
          </select>
        </div>

        <div className="px-5 max-h-[320px] overflow-y-auto space-y-3 pb-2">
          {cart.length === 0 && <p className="text-xs text-center py-8" style={{ color: t.sub }}>Cart is empty — tap a product to add it.</p>}
          {cart.map((i) => (
            <div key={i.id} className="flex items-start gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: t.bg }}>{i.img}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: t.text }}>{i.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
                    <button onClick={() => setQty(i.id, i.qty - 1)} className="w-6 h-6 flex items-center justify-center" style={{ color: t.sub }}><Minus size={11} /></button>
                    <span className="w-6 text-center text-xs font-semibold" style={{ color: t.text }}>{i.qty}</span>
                    <button onClick={() => setQty(i.id, i.qty + 1)} className="w-6 h-6 flex items-center justify-center" style={{ color: t.sub }}><Plus size={11} /></button>
                  </div>
                  <span className="text-xs font-bold ml-auto" style={{ color: t.text }}>{money(i.price * i.qty)}</span>
                </div>
              </div>
              <button onClick={() => removeItem(i.id)} className="w-6 h-6 flex items-center justify-center shrink-0" style={{ color: t.danger }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div className="mx-5 my-3 border-t" style={{ borderColor: t.border, borderStyle: "dashed" }} />

        <div className="px-5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between"><span style={{ color: t.sub }}>Subtotal</span><span className="font-semibold" style={{ color: t.text }}>{money(subtotal)}</span></div>
          <div className="flex items-center justify-between">
            <span style={{ color: t.sub }}>Discount</span>
            <div className="flex items-center gap-1.5">
              <input type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                className="w-12 px-1.5 py-1 rounded-md text-xs text-right outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
              <span style={{ color: t.sub }}>%</span>
            </div>
          </div>
          <div className="flex items-center justify-between"><span style={{ color: t.sub }}>Tax (12%)</span><span className="font-semibold" style={{ color: t.text }}>{money(tax)}</span></div>
        </div>

        <div className="mx-5 my-3 rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: t.primarySoft }}>
          <span className="text-sm font-bold" style={{ color: t.primary }}>Grand Total</span>
          <span className="text-xl font-extrabold" style={{ color: t.primary, fontFamily: "Manrope, sans-serif" }}>{money(total)}</span>
        </div>

        <div className="px-5 pb-5">
          <Button t={t} className="w-full" size="lg" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
            <CreditCard size={16} /> Checkout
          </Button>
        </div>
      </Card>

      {payOpen && (
        <PaymentModal t={t} method={method} setMethod={setMethod} total={total} onClose={() => setPayOpen(false)} onConfirm={completeSale} />
      )}

      {receiptOpen && (
        <ReceiptModal t={t} cart={cart} subtotal={subtotal} tax={tax} total={total} method={method} invoiceId={invoiceId} onNewSale={newSale} />
      )}
    </div>
  );
}
