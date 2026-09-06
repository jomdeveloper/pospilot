import React, { useEffect, useMemo, useState } from "react";
import { Ban, Eye, Receipt, Search, X } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { api } from "../../api";
import { money } from "../theme";

export default function SalesPage({ t, sessionToken, loggedInRole }) {
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("Wrong item");
  const [voidDescription, setVoidDescription] = useState("");

  const load = () => api.getSales().then(async (result) => {
    const enriched = await Promise.all(result.map(async (sale) => {
      if (sale.item_count !== undefined && sale.item_count !== null) return sale;
      try {
        const detail = await api.getSale(sale.id);
        return { ...sale, item_count: detail.items.reduce((count, item) => count + Number(item.qty || 0), 0) };
      } catch (_error) {
        return { ...sale, item_count: "-" };
      }
    }));
    setSales(enriched);
  }).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => sales.filter((sale) => `${sale.id} ${sale.customer} ${sale.payment_type}`.toLowerCase().includes(query.trim().toLowerCase())), [sales, query]);
  const viewSale = async (sale) => { try { setSelected(await api.getSale(sale.id)); setVoidReason("Wrong item"); setVoidDescription(""); setConfirmVoid(false); } catch (requestError) { setError(requestError.message); } };
  const canVoid = ["administrator", "admin", "manager"].includes(String(loggedInRole || "").toLowerCase());
  const submitVoid = async () => {
    if (!selected || !canVoid || voiding) return;
    if (!confirmVoid) { setConfirmVoid(true); return; }
    if (voidReason === "Other" && !voidDescription.trim()) { setError("Describe the reason when Other is selected."); return; }
    setError(""); setVoiding(true);
    try {
      await api.voidSale(selected.id, { reason: voidReason, description: voidDescription }, sessionToken);
      setSelected(null);
      await load();
    } catch (requestError) { setError(requestError.message); } finally { setVoiding(false); }
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft }}><Receipt size={20} style={{ color: t.primary }} /></div><div><h2 className="font-bold" style={{ color: t.text }}>Sales</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Review completed transactions and receipts.</p></div></div><div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sale, customer, payment" className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div></div></Card>
      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
      <Card t={t} className="overflow-hidden">{loading ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading sales...</p> : filtered.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No sales found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Sale", "Date", "Customer", "Items", "Payment", "Status", "Total", ""].map((heading) => <th key={heading} className="text-left font-semibold px-4 py-3 whitespace-nowrap" style={{ color: t.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{heading}</th>)}</tr></thead><tbody>{filtered.map((sale) => <tr key={sale.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 font-bold" style={{ color: t.text }}>#{sale.id}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{sale.created_at}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.text }}>{sale.customer}</td><td className="px-4 py-3" style={{ color: t.sub }}>{sale.item_count}</td><td className="px-4 py-3"><Badge t={t} tone="info">{sale.payment_type}</Badge></td><td className="px-4 py-3"><Badge t={t} tone={sale.status === "VOIDED" ? "danger" : sale.status === "FULLY_REFUNDED" ? "warning" : "success"}>{sale.status || "COMPLETED"}</Badge></td><td className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: t.primary }}>{money(sale.grand_total)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => viewSale(sale)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: t.primarySoft, color: t.primary }}><Eye size={14} /> View</button></td></tr>)}</tbody></table></div>}{!loading && <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${t.border}`, color: t.sub }}>Showing {filtered.length} of {sales.length} sales</div>}</Card>
      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.58)" }} onClick={() => setSelected(null)}><div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-5" style={{ background: t.card }} onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide" style={{ color: t.primary }}>Sale #{selected.id}</p><h3 className="text-lg font-bold mt-1" style={{ color: t.text }}>{selected.customer}</h3><p className="text-xs mt-1" style={{ color: t.sub }}>{selected.created_at} · {selected.payment_type} · {selected.status || "COMPLETED"}</p></div><button type="button" onClick={() => setSelected(null)} style={{ color: t.sub }} aria-label="Close sale details"><X size={18} /></button></div><div className="mt-5 space-y-2">{selected.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: t.bg }}><div><p className="text-sm font-semibold" style={{ color: t.text }}>{item.name}</p><p className="text-xs" style={{ color: t.sub }}>{item.qty} x {money(item.price)}</p></div><span className="font-bold" style={{ color: t.text }}>{money(item.total)}</span></div>)}</div><div className="mt-5 pt-4 space-y-1 text-sm" style={{ borderTop: `1px solid ${t.border}` }}><div className="flex justify-between"><span style={{ color: t.sub }}>Discount</span><span style={{ color: t.text }}>{money(selected.discount_total)}</span></div><div className="flex justify-between font-bold"><span style={{ color: t.text }}>Total</span><span style={{ color: t.primary }}>{money(selected.grand_total)}</span></div></div>{canVoid && (selected.status || "COMPLETED") === "COMPLETED" && <div className="mt-5 pt-4 space-y-3" style={{ borderTop: `1px solid ${t.border}` }}><p className="text-sm font-bold" style={{ color: t.text }}>Void Transaction?</p><p className="text-sm" style={{ color: t.sub }}>This will reverse the completed sale and restore the affected inventory. This action will be recorded in the audit log.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><select value={voidReason} onChange={(event) => setVoidReason(event.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option>Wrong item</option><option>Wrong quantity</option><option>Incorrect price</option><option>Duplicate transaction</option><option>Customer cancelled</option><option>Cashier error</option><option>Other</option></select><input value={voidDescription} onChange={(event) => setVoidDescription(event.target.value)} placeholder="Description if Other" className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setConfirmVoid(false)} disabled={voiding} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ color: t.sub }}>Go Back</button><button type="button" onClick={submitVoid} disabled={voiding} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold" style={{ background: t.danger, color: "#fff" }}><Ban size={15} /> {voiding ? "Voiding..." : confirmVoid ? "Void Transaction" : "Review Void"}</button></div></div>}</div></div>}
    </div>
  );
}
