import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { api } from "../../api";
import ProductPicker from "../components/ProductPicker";

export default function StockAdjustmentPage({ t, sessionToken }) {
  const [stock, setStock] = useState({ locations: [], products: [] });
  const [form, setForm] = useState({ productId: "", locationId: "", direction: "increase", quantity: "", reason: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.getInventoryStock().then(setStock).catch((requestError) => setError(requestError.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    setForm((current) => ({ ...current, productId: current.productId || String(stock.products[0]?.id || ""), locationId: current.locationId || String(stock.locations[0]?.id || "") }));
  }, [stock.products, stock.locations]);

  const selectedProduct = useMemo(() => stock.products.find((product) => String(product.id) === String(form.productId)), [stock.products, form.productId]);
  const available = selectedProduct?.locations?.[form.locationId]?.quantity || 0;

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setMessage(""); setSaving(true);
    try {
      await api.createStockAdjustment({ ...form, productId: Number(form.productId), locationId: Number(form.locationId), quantity: Number(form.quantity) }, sessionToken);
      setMessage("Stock adjustment saved.");
      setForm((current) => ({ ...current, quantity: "", reason: "" }));
      await load();
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.warningSoft }}><ClipboardCheck size={20} style={{ color: t.warning }} /></div><div><h2 className="font-bold" style={{ color: t.text }}>Stock Adjustment</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Correct physical counts, damages, losses, or found stock.</p></div></div></Card>
      {(error || message) && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: error ? t.dangerSoft : t.successSoft, color: error ? t.danger : t.success }}>{error || message}</div>}
      <Card t={t} className="p-5 max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ProductPicker t={t} products={stock.products} value={form.productId} onChange={(productId) => setForm({ ...form, productId })} locationId={form.locationId} requireStock={form.direction === "decrease"} />
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Location</span><select required value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Select location</option>{stock.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Adjustment</span><select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="increase">Add stock</option><option value="decrease">Remove stock</option></select></label>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Quantity</span><input required min="1" step="1" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /><span className="text-[11px] mt-1 block" style={{ color: t.sub }}>Available here: {available}</span></label>
          </div>
          <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Reason</span><textarea required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} rows="3" placeholder="Example: Physical count correction" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>
          <div className="flex justify-end"><Button t={t} type="submit" disabled={saving || !stock.products.length}><RefreshCw size={15} /> {saving ? "Saving..." : "Save adjustment"}</Button></div>
        </form>
      </Card>
    </div>
  );
}
