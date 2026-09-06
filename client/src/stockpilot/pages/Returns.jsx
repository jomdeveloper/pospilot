import React, { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { api } from "../../api";
import { money } from "../theme";

export default function ReturnsPage({ t, sessionToken }) {
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getSales().then(setSales).catch((requestError) => setError(requestError.message)); }, []);
  const returnableSales = useMemo(() => sales.filter((sale) => !["VOIDED", "CANCELLED", "FULLY_REFUNDED"].includes(String(sale.status || "COMPLETED").toUpperCase()) && Number(sale.returnable_count) > 0 && `${sale.id} ${sale.customer} ${sale.payment_type}`.toLowerCase().includes(query.trim().toLowerCase())), [sales, query]);
  const chooseSale = async (sale) => { setError(""); setMessage(""); try { const detail = await api.getSale(sale.id); setSelected(detail); setQuantities({}); setReason(""); setRefundMethod("cash"); } catch (requestError) { setError(requestError.message); } };
  const submit = async (event) => {
    event.preventDefault();
    const items = selected.items.filter((item) => Number(quantities[item.id]) > 0).map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id]) }));
    if (!items.length) return setError("Choose at least one item to return.");
    setError(""); setMessage(""); setSaving(true);
    try { const result = await api.returnSale(selected.id, { items, reason, refundMethod }, sessionToken); setMessage(`Return completed. Refund total: ${money(result.refundTotal)}`); setSelected(null); setSales(await api.getSales()); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.warningSoft }}><RotateCcw size={20} style={{ color: t.warning }} /></div><div><h2 className="font-bold" style={{ color: t.text }}>Returns</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Select a completed sale and return eligible items to stock.</p></div></div><div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sale or customer" className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div></div></Card>
      {(error || message) && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: error ? t.dangerSoft : t.successSoft, color: error ? t.danger : t.success }}>{error || message}</div>}
      {!selected && <Card t={t} className="overflow-hidden">{returnableSales.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No sales have returnable items.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Sale", "Date", "Customer", "Returnable items", "Total", ""].map((heading) => <th key={heading} className="text-left font-semibold px-4 py-3 whitespace-nowrap" style={{ color: t.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{heading}</th>)}</tr></thead><tbody>{returnableSales.map((sale) => <tr key={sale.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 font-bold" style={{ color: t.text }}>#{sale.id}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{sale.created_at}</td><td className="px-4 py-3" style={{ color: t.text }}>{sale.customer}</td><td className="px-4 py-3"><Badge t={t} tone="warning">{sale.returnable_count}</Badge></td><td className="px-4 py-3 font-bold" style={{ color: t.primary }}>{money(sale.grand_total)}</td><td className="px-4 py-3 text-right"><Button t={t} size="sm" variant="outline" onClick={() => chooseSale(sale)}><RotateCcw size={14} /> Start return</Button></td></tr>)}</tbody></table></div>}</Card>}
      {selected && <Card t={t} className="p-5 max-w-3xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide" style={{ color: t.primary }}>Return sale #{selected.id}</p><p className="text-sm mt-1" style={{ color: t.sub }}>{selected.customer} · {selected.created_at}</p></div><button type="button" onClick={() => setSelected(null)} className="text-xs font-semibold" style={{ color: t.sub }}>Cancel</button></div><form onSubmit={submit} className="mt-5 space-y-4"><div className="space-y-2">{selected.items.filter((item) => item.returnable_qty > 0).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3" style={{ background: t.bg }}><div><p className="text-sm font-semibold" style={{ color: t.text }}>{item.name}</p><p className="text-xs" style={{ color: t.sub }}>Purchased {item.qty} · Returnable {item.returnable_qty} · {money(item.price)} each</p></div><input type="number" min="0" max={item.returnable_qty} step="1" value={quantities[item.id] || ""} onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })} placeholder="Qty" className="w-20 px-2 py-2 rounded-lg text-sm text-right outline-none" style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }} /></div>)}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Refund method</span><select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="cash">Cash</option><option value="card">Card</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></label><label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Reason</span><input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for return" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label></div><div className="flex justify-end"><Button t={t} type="submit" disabled={saving}><RotateCcw size={15} /> {saving ? "Processing..." : "Complete return"}</Button></div></form></Card>}
    </div>
  );
}
