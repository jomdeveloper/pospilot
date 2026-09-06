import React, { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export default function ProductPicker({ t, products, value, onChange, locationId, requireStock = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState(requireStock ? "available" : "all");
  const selected = products.find((product) => String(product.id) === String(value));
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(), [products]);
  const filtered = useMemo(() => products.filter((product) => {
    const text = `${product.name} ${product.barcode || ""} ${product.sku || ""}`.toLowerCase();
    const available = Number(product.locations?.[locationId]?.quantity || 0);
    return text.includes(query.trim().toLowerCase()) && (category === "all" || product.category === category) && (stockFilter !== "available" || available > 0);
  }), [products, query, category, stockFilter, locationId]);

  const choose = (product) => { onChange(String(product.id)); setOpen(false); setQuery(""); };
  return (
    <div className="relative">
      <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Product</span>
      <button type="button" onClick={() => setOpen((current) => !current)} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm text-left" style={{ background: t.bg, color: selected ? t.text : t.sub, border: `1px solid ${t.border}` }}>
        <span className="truncate">{selected ? selected.name : "Search and select product"}</span><ChevronDown size={15} />
      </button>
      {selected && <button type="button" onClick={() => onChange("")} className="absolute right-8 top-8 p-1" style={{ color: t.sub }} aria-label="Clear selected product"><X size={13} /></button>}
      {open && <div className="absolute z-30 mt-2 w-full rounded-xl p-3 shadow-xl" style={{ background: t.card, border: `1px solid ${t.border}` }}>
        <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, barcode, or SKU" className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div>
        <div className="grid grid-cols-2 gap-2 mt-2"><select value={category} onChange={(event) => setCategory(event.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="px-2 py-2 rounded-lg text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="all">Any stock</option><option value="available">In stock here</option></select></div>
        <div className="max-h-56 overflow-y-auto mt-2 space-y-1">{filtered.length === 0 ? <p className="px-2 py-4 text-center text-xs" style={{ color: t.sub }}>No matching products.</p> : filtered.map((product) => { const available = Number(product.locations?.[locationId]?.quantity || 0); return <button type="button" key={product.id} onClick={() => choose(product)} className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left" style={{ background: String(product.id) === String(value) ? t.primarySoft : "transparent" }}><span className="min-w-0"><span className="block text-xs font-semibold truncate" style={{ color: t.text }}>{product.name}</span><span className="block text-[10px] truncate" style={{ color: t.sub }}>{product.category || "Uncategorized"} · SKU {product.sku || "-"} · Barcode {product.barcode || "-"}</span></span><span className="flex items-center gap-1 shrink-0 text-[10px]" style={{ color: t.sub }}>{available} here {String(product.id) === String(value) && <Check size={13} style={{ color: t.primary }} />}</span></button>; })}</div>
      </div>}
    </div>
  );
}