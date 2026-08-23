import React, { useEffect, useMemo, useState } from "react";
import { PackageCheck, ClipboardList, TrendingUp, CalendarClock, Filter } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import StatCard from "../components/StatCard";
import StockBar from "../components/ui/StockBar";
import { api } from "../../api";

function expiryDate(product) {
  const value = product.expiry || product.exp;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function InventoryPage({ t }) {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => { api.getProducts().then(setProducts).catch(() => setProducts([])); }, []);

  const nearExpiry = products.filter((product) => {
    const expiry = expiryDate(product);
    return expiry && expiry <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  }).length;
  const totalStock = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const cards = [
    { label: "Available Stock", value: totalStock, icon: PackageCheck, tone: "success" },
    { label: "Reserved", value: 0, icon: ClipboardList, tone: "info" },
    { label: "Incoming", value: 0, icon: TrendingUp, tone: "primary" },
    { label: "Near Expiry", value: nearExpiry, icon: CalendarClock, tone: "warning" },
  ];
  const rows = useMemo(() => products.map((product) => {
    const min = product.reorder_level ?? product.min ?? 0;
    const max = product.maximum_stock ?? product.max ?? 0;
    const stock = Number(product.stock || 0);
    const expiry = expiryDate(product);
    const now = new Date();
    const status = stock === 0 ? { tone: "danger", label: "Out of stock", key: "out-of-stock" } : stock <= Number(min) ? { tone: "warning", label: "Reorder soon", key: "reorder" } : { tone: "success", label: "Healthy", key: "healthy" };
    const expiryStatus = expiry && expiry < now ? "expired" : expiry && expiry <= new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) ? "near-expiry" : "not-near-expiry";
    return { product, min, max, stock, status, expiryStatus };
  }), [products]);
  const filteredRows = useMemo(() => rows.filter(({ status, expiryStatus }) => filter === "all" || filter === status.key || filter === expiryStatus), [rows, filter]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{cards.map((card) => <StatCard key={card.label} t={t} icon={card.icon} label={card.label} value={card.value} tone={card.tone} />)}</div>
      <Card t={t} className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${t.border}` }}><div className="flex items-center gap-2 text-sm font-semibold" style={{ color: t.text }}><Filter size={15} style={{ color: t.sub }} />Inventory status</div><label className="flex items-center gap-2 text-sm" style={{ color: t.sub }}><span className="sr-only">Filter inventory</span><select value={filter} onChange={(event) => setFilter(event.target.value)} className="px-3 py-2 rounded-xl outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="all">All products ({rows.length})</option><option value="out-of-stock">Out of stock</option><option value="reorder">Reorder soon</option><option value="near-expiry">Near expiry</option><option value="expired">Expired</option><option value="healthy">Healthy</option></select></label></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr style={{ background: t.bg }}>{["Product", "Current Stock", "Min / Max", "Batch", "Expiration", "Stock Level", "Status"].map((heading) => <th key={heading} className="text-left font-semibold px-4 py-3 whitespace-nowrap" style={{ color: t.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{heading}</th>)}</tr></thead><tbody>{filteredRows.map(({ product, min, max, stock, status }) => <tr key={product.id} style={{ borderTop: `1px solid ${t.border}` }}><td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: t.text }}>{product.name}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.text }}>{stock}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{min} / {max || "-"}</td><td className="px-4 py-3 font-mono text-xs" style={{ color: t.sub }}>{product.batch || "-"}</td><td className="px-4 py-3 whitespace-nowrap" style={{ color: t.sub }}>{product.expiry || product.exp ? product.expiry || product.exp : "Not provided"}</td><td className="px-4 py-3 w-40"><StockBar t={t} pct={max ? (stock / max) * 100 : 0} /></td><td className="px-4 py-3"><Badge t={t} tone={status.tone}>{status.label}</Badge></td></tr>)}</tbody></table></div>{filteredRows.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: t.sub }}>No products match this filter.</div>}</Card>
    </div>
  );
}
