import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { Wallet, BarChart3, Package, AlertTriangle, PackageX, CalendarClock, Users, Truck } from "lucide-react";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import StatCard from "../components/StatCard";
import StockBar from "../components/ui/StockBar";
import { api } from "../../api";
import { money } from "../theme";

function productExpiry(product) {
  const value = product.expiry || product.exp;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function Dashboard({ t }) {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [supplierCount, setSupplierCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([api.getProducts(), api.getSales(), api.getCustomers(), api.getSuppliers()]).then(([nextProducts, nextSales, customers, suppliers]) => {
      setProducts(nextProducts);
      setSales(nextSales);
      setCustomerCount(customers.length);
      setSupplierCount(suppliers.length);
    }).catch((requestError) => setError(requestError.message || "Unable to load dashboard data")).finally(() => setLoading(false));
  }, []);

  const lowStock = products.filter((product) => product.stock > 0 && product.stock <= (product.reorder_level ?? product.min ?? 0));
  const outOfStock = products.filter((product) => product.stock === 0);
  const nearExpiry = products.filter((product) => {
    const expiry = productExpiry(product);
    return expiry && expiry <= new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  });
  const today = new Date().toDateString();
  const salesToday = sales.filter((sale) => new Date(sale.created_at).toDateString() === today);
  const totalSalesToday = salesToday.filter((sale) => sale.status !== "VOIDED" && sale.status !== "CANCELLED").reduce((sum, sale) => sum + Number(sale.grand_total || 0) - Number(sale.refunded_total || 0), 0);
  const monthlySales = sales.filter((sale) => sale.status !== "VOIDED" && sale.status !== "CANCELLED").reduce((sum, sale) => sum + Number(sale.grand_total || 0) - Number(sale.refunded_total || 0), 0);

  const categoryDist = useMemo(() => {
    const totals = new Map();
    products.forEach((product) => totals.set(product.category || "General", (totals.get(product.category || "General") || 0) + Number(product.stock || 0)));
    return [...totals.entries()].map(([name, value]) => ({ name, value }));
  }, [products]);
  const pieColors = [t.primary, t.success, t.warning, t.info, t.danger];
  const salesTrend = sales.slice(0, 7).reverse().map((sale) => ({ day: new Date(sale.created_at).toLocaleDateString(undefined, { weekday: "short" }), sales: Number(sale.grand_total || 0) }));

  return (
    <div className="space-y-5">
      {loading && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.bg, color: t.sub }}>Loading dashboard data...</div>}
      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard t={t} icon={Wallet} label="Total Sales Today" value={money(totalSalesToday)} tone="primary" />
        <StatCard t={t} icon={BarChart3} label="Recorded Sales" value={money(monthlySales)} tone="success" />
        <StatCard t={t} icon={Package} label="Products" value={products.length} tone="info" />
        <StatCard t={t} icon={AlertTriangle} label="Low Stock" value={lowStock.length} tone="warning" />
        <StatCard t={t} icon={PackageX} label="Out of Stock" value={outOfStock.length} tone="danger" />
        <StatCard t={t} icon={CalendarClock} label="Near Expiry" value={nearExpiry.length} tone="warning" />
        <StatCard t={t} icon={Users} label="Total Customers" value={customerCount} tone="primary" />
        <StatCard t={t} icon={Truck} label="Total Suppliers" value={supplierCount} tone="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card t={t} className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-1"><h3 className="font-bold text-sm" style={{ color: t.text }}>Sales Trend</h3><Badge t={t} tone="success">Recorded sales</Badge></div>
          <p className="text-xs mb-3" style={{ color: t.sub }}>Recent transactions from the database</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: t.sub }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: t.sub }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, fontSize: 12 }} formatter={(value) => money(value)} />
              <Line type="monotone" dataKey="sales" stroke={t.primary} strokeWidth={3} dot={{ r: 3, fill: t.primary }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card t={t} className="p-5">
          <h3 className="font-bold text-sm mb-1" style={{ color: t.text }}>Category Distribution</h3>
          <p className="text-xs mb-2" style={{ color: t.sub }}>Units in stock by category</p>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart><Pie data={categoryDist} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={3}>{categoryDist.map((category, index) => <Cell key={category.name} fill={pieColors[index % pieColors.length]} />)}</Pie><Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, fontSize: 12 }} /></PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">{categoryDist.map((category, index) => <div key={category.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2" style={{ color: t.sub }}><span className="w-2 h-2 rounded-full" style={{ background: pieColors[index % pieColors.length] }} />{category.name}</span><span className="font-semibold" style={{ color: t.text }}>{category.value}</span></div>)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card t={t} className="p-5 lg:col-span-2"><div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm" style={{ color: t.text }}>Recent Sales</h3></div><div className="space-y-1">{sales.slice(0, 5).map((sale) => <div key={sale.id} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${t.border}` }}><div className="min-w-0"><p className="text-sm font-semibold truncate" style={{ color: t.text }}>#{sale.id} · {sale.customer || "Walk-in Customer"}</p><p className="text-xs" style={{ color: t.sub }}>{sale.payment_type || "Unknown"} · {new Date(sale.created_at).toLocaleString()}</p></div><p className="text-sm font-bold shrink-0" style={{ color: t.text }}>{money(sale.grand_total)}</p></div>)}</div></Card>
        <Card t={t} className="p-5"><h3 className="font-bold text-sm mb-3" style={{ color: t.text }}>Low Stock List</h3><div className="space-y-3">{lowStock.slice(0, 5).map((product) => <div key={product.id}><div className="flex items-center justify-between mb-1"><p className="text-xs font-semibold truncate" style={{ color: t.text }}>{product.name}</p><span className="text-xs font-bold shrink-0 ml-2" style={{ color: t.warning }}>{product.stock}</span></div><StockBar t={t} pct={product.maximum_stock ? (product.stock / product.maximum_stock) * 100 : 0} /></div>)}</div></Card>
      </div>
    </div>
  );
}
