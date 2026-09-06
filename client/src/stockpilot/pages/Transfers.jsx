import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { api } from "../../api";
import ProductPicker from "../components/ProductPicker";

export default function TransfersPage({ t, sessionToken }) {
  const [stock, setStock] = useState({ locations: [], products: [] });
  const [form, setForm] = useState({ productId: "", fromLocationId: "", toLocationId: "", quantity: "", reason: "" });
  const [newLocation, setNewLocation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.getInventoryStock().then(setStock).catch((requestError) => setError(requestError.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    setForm((current) => ({ ...current, productId: current.productId || String(stock.products[0]?.id || ""), fromLocationId: current.fromLocationId || String(stock.locations[0]?.id || ""), toLocationId: current.toLocationId || String(stock.locations[1]?.id || "") }));
  }, [stock.products, stock.locations]);

  const selectedProduct = useMemo(() => stock.products.find((product) => String(product.id) === String(form.productId)), [stock.products, form.productId]);
  const available = selectedProduct?.locations?.[form.fromLocationId]?.quantity || 0;
  const addLocation = async (event) => {
    event.preventDefault();
    if (!newLocation.trim()) return;
    try { await api.createInventoryLocation({ name: newLocation.trim() }, sessionToken); setNewLocation(""); setMessage("Location added."); await load(); } catch (requestError) { setError(requestError.message); }
  };
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setMessage(""); setSaving(true);
    try {
      await api.createStockTransfer({ ...form, productId: Number(form.productId), fromLocationId: Number(form.fromLocationId), toLocationId: Number(form.toLocationId), quantity: Number(form.quantity) }, sessionToken);
      setMessage("Stock transfer completed.");
      setForm((current) => ({ ...current, quantity: "", reason: "" }));
      await load();
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.infoSoft }}><ArrowLeftRight size={20} style={{ color: t.info }} /></div><div><h2 className="font-bold" style={{ color: t.text }}>Stock Transfers</h2><p className="text-xs mt-1" style={{ color: t.sub }}>Move products between active inventory locations.</p></div></div></Card>
      {(error || message) && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: error ? t.dangerSoft : t.successSoft, color: error ? t.danger : t.success }}>{error || message}</div>}
      <Card t={t} className="p-5 max-w-3xl">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><ProductPicker t={t} products={stock.products} value={form.productId} onChange={(productId) => setForm({ ...form, productId })} locationId={form.fromLocationId} requireStock /></div>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>From</span><select required value={form.fromLocationId} onChange={(event) => setForm({ ...form, fromLocationId: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Source location</option>{stock.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><span className="text-[11px] mt-1 block" style={{ color: t.sub }}>Available: {available}</span></label>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>To</span><select required value={form.toLocationId} onChange={(event) => setForm({ ...form, toLocationId: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Destination location</option>{stock.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Quantity</span><input required min="1" step="1" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>
          </div>
          <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Reason</span><textarea required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} rows="3" placeholder="Example: Replenish branch stock" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>
          <div className="flex flex-wrap items-end gap-2 pt-2" style={{ borderTop: `1px solid ${t.border}` }}><label className="flex-1 min-w-56"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Add location</span><input value={newLocation} onChange={(event) => setNewLocation(event.target.value)} placeholder="Branch or warehouse name" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label><Button t={t} type="button" variant="outline" onClick={addLocation}><Plus size={15} /> Add location</Button><Button t={t} type="submit" disabled={saving || stock.locations.length < 2 || !stock.products.length}><ArrowLeftRight size={15} /> {saving ? "Transferring..." : "Transfer stock"}</Button></div>
        </form>
      </Card>
    </div>
  );
}
