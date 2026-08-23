import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Mail, Pencil, Phone, Plus, Search, Trash2, Truck, UserRound, X } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { api } from "../../api";

const EMPTY_FORM = { name: "", contact: "", phone: "", email: "" };

export default function SuppliersPage({ t, sessionToken, loggedInRole }) {
  const [suppliers, setSuppliers] = useState([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSuppliers = () => {
    setLoading(true);
    api.getSuppliers().then(setSuppliers).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  };

  useEffect(() => { loadSuppliers(); }, []);

  const filtered = useMemo(() => suppliers.filter((supplier) => `${supplier.name} ${supplier.contact || ""} ${supplier.phone || ""} ${supplier.email || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [suppliers, query]);

  const closeForm = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const canEditSuppliers = ["administrator", "admin", "manager"].includes(String(loggedInRole || "").trim().toLowerCase());
  const canDeleteSuppliers = ["administrator", "admin"].includes(String(loggedInRole || "").trim().toLowerCase());
  const openCreateForm = () => { setEditingSupplier(null); setForm(EMPTY_FORM); setError(""); setShowForm(true); };
  const openEditForm = (supplier) => { setEditingSupplier(supplier); setForm({ name: supplier.name || "", contact: supplier.contact || "", phone: supplier.phone || "", email: supplier.email || "" }); setError(""); setShowForm(true); };

  const createSupplier = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Supplier name is required.");
    try {
      if (editingSupplier) await api.updateSupplier(editingSupplier.id, form, sessionToken);
      else await api.createSupplier(form, sessionToken);
      closeForm();
      loadSuppliers();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const deleteSupplier = async () => {
    if (!deleteTarget || deleting) return;
    try { setDeleting(true); await api.deleteSupplier(deleteTarget.id, sessionToken); setDeleteTarget(null); loadSuppliers(); } catch (requestError) { setError(requestError.message); } finally { setDeleting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card t={t} className="p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft }}><Truck size={18} style={{ color: t.primary }} /></div><div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{suppliers.length}</p><p className="text-xs" style={{ color: t.sub }}>Total suppliers</p></div></div></Card>
        <Card t={t} className="p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.successSoft }}><UserRound size={18} style={{ color: t.success }} /></div><div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{suppliers.filter((supplier) => supplier.status === "Active").length}</p><p className="text-xs" style={{ color: t.sub }}>Active suppliers</p></div></div></Card>
        <Card t={t} className="p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.infoSoft }}><Mail size={18} style={{ color: t.info }} /></div><div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{suppliers.filter((supplier) => supplier.email).length}</p><p className="text-xs" style={{ color: t.sub }}>With email contact</p></div></div></Card>
      </div>

      <Card t={t} className="p-4"><div className="flex flex-wrap items-center gap-3"><div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search suppliers or contacts…" className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div>{canEditSuppliers && <Button t={t} onClick={openCreateForm}><Plus size={15} /> Add Supplier</Button>}</div></Card>

      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
      <Card t={t} className="overflow-hidden">
        {loading ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading suppliers…</p> : filtered.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No suppliers found.</p> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">{filtered.map((supplier) => <div key={supplier.id} className="rounded-2xl border p-5" style={{ borderColor: t.border }}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white" style={{ background: t.primary }}>{supplier.name.slice(0, 2).toUpperCase()}</div><div><h3 className="font-bold" style={{ color: t.text }}>{supplier.name}</h3><Badge t={t} tone={supplier.status === "Active" ? "success" : "neutral"}>{supplier.status || "Active"}</Badge></div></div><div className="flex items-center gap-1"><Truck size={18} style={{ color: t.sub }} />{canEditSuppliers && <button type="button" onClick={() => openEditForm(supplier)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.primary, background: t.primarySoft }} aria-label={`Edit ${supplier.name}`} title="Edit supplier"><Pencil size={15} /></button>}{canDeleteSuppliers && <button type="button" onClick={() => setDeleteTarget(supplier)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.danger, background: t.dangerSoft }} aria-label={`Delete ${supplier.name}`} title="Delete supplier"><Trash2 size={15} /></button>}</div></div><div className="mt-5 space-y-2 text-sm" style={{ color: t.sub }}><p className="flex items-center gap-2"><UserRound size={14} /> {supplier.contact || "No contact person"}</p><p className="flex items-center gap-2"><Phone size={14} /> {supplier.phone || "No phone number"}</p><p className="flex items-center gap-2"><Mail size={14} /> {supplier.email || "No email address"}</p></div></div>)}</div>}
        {!loading && <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${t.border}`, color: t.sub }}>Showing {filtered.length} of {suppliers.length} suppliers</div>}
      </Card>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }} onClick={closeForm}><form className="w-full max-w-md rounded-2xl p-5" style={{ background: t.card }} onSubmit={createSupplier} onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between mb-5"><h3 className="font-bold" style={{ color: t.text }}>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h3><button type="button" onClick={closeForm} style={{ color: t.sub }}><X size={18} /></button></div><div className="space-y-3">{[{ key: "name", label: "Company name", placeholder: "Supplier company" }, { key: "contact", label: "Contact person", placeholder: "Contact name" }, { key: "phone", label: "Phone", placeholder: "09xx xxx xxxx" }, { key: "email", label: "Email", placeholder: "supplier@example.com" }].map((field) => <label key={field.key} className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{field.label}</span><input type={field.key === "email" ? "email" : "text"} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>)}</div>{error && <p className="text-xs mt-3" style={{ color: t.danger }}>{error}</p>}<div className="flex justify-end gap-2 mt-5"><Button t={t} type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button t={t} type="submit">{editingSupplier ? "Update Supplier" : "Save Supplier"}</Button></div></form></div>}
      {deleteTarget && <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.58)" }} role="presentation"><div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: t.card, border: `1px solid ${t.border}` }} role="alertdialog" aria-modal="true" aria-labelledby="delete-supplier-title" aria-describedby="delete-supplier-description"><div className="flex items-start gap-3 px-5 py-5" style={{ borderBottom: `1px solid ${t.border}` }}><div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: t.dangerSoft, color: t.danger }}><AlertTriangle size={22} /></div><div className="flex-1"><h3 id="delete-supplier-title" className="font-bold" style={{ color: t.text }}>Delete supplier?</h3><p id="delete-supplier-description" className="text-sm mt-1" style={{ color: t.sub }}>You are about to delete <strong style={{ color: t.text }}>{deleteTarget.name}</strong>.</p></div><button type="button" onClick={() => setDeleteTarget(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.sub, background: t.bg }} aria-label="Close delete dialog" title="Close"><X size={16} /></button></div><div className="px-5 py-4 text-xs" style={{ color: t.sub, background: t.bg }}>Suppliers assigned to products cannot be deleted.</div><div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${t.border}` }}><Button t={t} type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button><Button t={t} type="button" variant="danger" onClick={deleteSupplier} disabled={deleting}><Trash2 size={14} /> {deleting ? "Deleting..." : "Delete supplier"}</Button></div></div></div>}
    </div>
  );
}
