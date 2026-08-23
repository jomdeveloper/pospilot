import React, { useEffect, useMemo, useState } from "react";
import { Mail, Phone, Plus, Search, UserRound, X } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import { api } from "../../api";

const EMPTY_FORM = { name: "", phone: "", email: "", customerType: "Walk-in", memberId: "" };
const CUSTOMER_TYPES = ["Walk-in", "Member", "Senior", "PWD"];

export default function CustomersPage({ t }) {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCustomers = () => {
    setLoading(true);
    api.getCustomers().then(setCustomers).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false));
  };

  useEffect(() => { loadCustomers(); }, []);

  const filtered = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.phone || ""} ${customer.email || ""} ${customer.member_id || ""} ${customer.customer_type}`.toLowerCase().includes(query.trim().toLowerCase())), [customers, query]);
  const members = customers.filter((customer) => customer.customer_type === "Member").length;

  const closeForm = () => { setShowForm(false); setForm(EMPTY_FORM); setError(""); };
  const createCustomer = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Customer name is required.");
    try { await api.createCustomer(form); closeForm(); loadCustomers(); } catch (requestError) { setError(requestError.message); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card t={t} className="p-5"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft }}><UserRound size={18} style={{ color: t.primary }} /></div><div><p className="text-2xl font-extrabold" style={{ color: t.text }}>{customers.length}</p><p className="text-xs" style={{ color: t.sub }}>Total customers</p></div></div></Card>
        <Card t={t} className="p-5"><p className="text-2xl font-extrabold" style={{ color: t.text }}>{members}</p><p className="text-xs mt-1" style={{ color: t.sub }}>Member customers</p></Card>
        <Card t={t} className="p-5"><p className="text-2xl font-extrabold" style={{ color: t.text }}>{customers.filter((customer) => customer.phone).length}</p><p className="text-xs mt-1" style={{ color: t.sub }}>With phone contact</p></Card>
      </div>

      <Card t={t} className="p-4"><div className="flex flex-wrap items-center gap-3"><div className="relative flex-1 min-w-[220px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers, phone, or member ID…" className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></div><Button t={t} onClick={() => setShowForm(true)}><Plus size={15} /> Add Customer</Button></div></Card>
      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
      <Card t={t} className="overflow-hidden">
        {loading ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>Loading customers…</p> : filtered.length === 0 ? <p className="p-12 text-center text-sm" style={{ color: t.sub }}>No customers found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Customer", "Contact", "Type", "Member ID", "Status"].map((heading) => <th key={heading} className="text-left px-4 py-3 text-[11px] uppercase whitespace-nowrap" style={{ color: t.sub }}>{heading}</th>)}</tr></thead><tbody>{filtered.map((customer) => <tr key={customer.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: t.primary }}>{customer.name.slice(0, 2).toUpperCase()}</div><span className="font-semibold" style={{ color: t.text }}>{customer.name}</span></div></td><td className="px-4 py-3 space-y-1" style={{ color: t.sub }}><div className="flex items-center gap-2"><Phone size={13} />{customer.phone || "No phone"}</div><div className="flex items-center gap-2"><Mail size={13} />{customer.email || "No email"}</div></td><td className="px-4 py-3" style={{ color: t.text }}>{customer.customer_type}</td><td className="px-4 py-3" style={{ color: t.sub }}>{customer.member_id || "—"}</td><td className="px-4 py-3"><Badge t={t} tone={customer.status === "Active" ? "success" : "neutral"}>{customer.status}</Badge></td></tr>)}</tbody></table></div>}
        {!loading && <div className="px-4 py-3 text-xs" style={{ borderTop: `1px solid ${t.border}`, color: t.sub }}>Showing {filtered.length} of {customers.length} customers</div>}
      </Card>

      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }} onClick={closeForm}><form className="w-full max-w-md rounded-2xl p-5" style={{ background: t.card }} onSubmit={createCustomer} onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between mb-5"><h3 className="font-bold" style={{ color: t.text }}>Add Customer</h3><button type="button" onClick={closeForm} style={{ color: t.sub }}><X size={18} /></button></div><div className="space-y-3">{[{ key: "name", label: "Full name", placeholder: "Juan Dela Cruz" }, { key: "phone", label: "Phone", placeholder: "09xx xxx xxxx" }, { key: "email", label: "Email", placeholder: "customer@example.com" }].map((field) => <label key={field.key} className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{field.label}</span><input type={field.key === "email" ? "email" : "text"} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>)}<label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Customer type</span><select value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>{CUSTOMER_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>{form.customerType === "Member" && <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Member ID</span><input value={form.memberId} onChange={(event) => setForm({ ...form, memberId: event.target.value })} placeholder="MEM-0001" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>}</div>{error && <p className="text-xs mt-3" style={{ color: t.danger }}>{error}</p>}<div className="flex justify-end gap-2 mt-5"><Button t={t} type="button" variant="outline" onClick={closeForm}>Cancel</Button><Button t={t} type="submit">Save Customer</Button></div></form></div>}
    </div>
  );
}
