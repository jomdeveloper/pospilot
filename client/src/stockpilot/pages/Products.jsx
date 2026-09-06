import React, { useState, useMemo, useEffect } from "react";
import { AlertCircle, Baby, Search, Download, Eye, HeartPulse, Package, Pencil, Pill, Plus, Scissors, ShoppingBasket, Sparkles, Stethoscope, Trash2, ChevronLeft, ChevronRight, AlertTriangle, X } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import ProductFormModal from "./products/ProductFormModal";
import { deleteProduct, getProductMetadata, getProducts } from "../api/products";
import { money } from "../theme";

const CATEGORY_ICONS = {
  Medicine: Pill,
  "Health & Wellness": HeartPulse,
  "Medical Products": Stethoscope,
  "Personal Care": Scissors,
  "Beauty & Baby": Baby,
  "Food & Beverage": ShoppingBasket,
  Services: Sparkles,
};

export default function ProductsPage({ t, sessionToken, loggedInRole }) {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const isAdministrator = ["administrator", "admin"].includes(String(loggedInRole || "").trim().toLowerCase());

  useEffect(() => {
    Promise.all([getProducts(), getProductMetadata()])
      .then(([nextProducts, metadata]) => {
        setProducts(nextProducts);
        setCategories(metadata.categories || []);
      })
      .catch((error) => setLoadError(error.message || "Unable to load products"));
  }, []);

  const refreshProducts = () => getProducts().then(setProducts);

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;

    try {
      setDeleting(true);
      await deleteProduct(deleteTarget.id, sessionToken);
      setDeleteTarget(null);
      await refreshProducts();
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchQ = (p.name + p.brand + p.barcode).toLowerCase().includes(query.toLowerCase());
      const matchCat = catFilter === "all" || p.category === catFilter;
      return matchQ && matchCat;
    });
  }, [products, query, catFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleProducts = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    setPage(1);
  }, [query, catFilter]);
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);
  const exportProducts = () => {
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Name", "SKU", "Barcode", "Category", "Product Type", "Price", "Stock"],
      ...filtered.map((product) => [product.name, product.sku, product.barcode, product.category, product.product_type, product.price, product.stock]),
    ].map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pospilot-products.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const statusOf = (p) =>
    p.stock === 0 ? { tone: "danger", label: "Out of stock" } : p.stock <= p.min ? { tone: "warning", label: "Low stock" } : { tone: "success", label: "In stock" };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: t.sub }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, brand, or barcode…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
          </select>
          <Button t={t} variant="outline" onClick={exportProducts}><Download size={14} /> Export</Button>
          {isAdministrator || ["manager"].includes(String(loggedInRole || "").trim().toLowerCase()) ? <Button t={t} onClick={() => { setViewOnly(false); setShowForm(true); }}><Plus size={15} /> Add Product</Button> : null}
        </div>
      </Card>
      {loadError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{loadError}</div>}

      <Card t={t} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: t.bg }}>
                 {["Product", "SKU", "Barcode", "Category", "Price", "Stock", "Status", ""].map((h) => (
                  <th key={h} className="text-left font-semibold px-4 py-3 whitespace-nowrap" style={{ color: t.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const st = statusOf(p);
                const ProductIcon = CATEGORY_ICONS[p.category || p.cat] || Package;
                const imageUrl = p.image_url || p.imageUrl;
                return (
                  <tr key={p.id} className="group" style={{ borderTop: `1px solid ${t.border}` }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {imageUrl ? <img src={imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" /> : <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.bg, color: t.primary }} aria-label={`${p.category || p.cat || "Product"} icon`}><ProductIcon size={18} strokeWidth={1.75} /></div>}
                        <div className="min-w-0">
                          <p className="font-semibold truncate" style={{ color: t.text }}>{p.name}</p>
                          <p className="text-xs truncate" style={{ color: t.sub }}>{p.brand} · {p.form}</p>
                        </div>
                      </div>
                    </td>
                     <td className="px-4 py-3 font-mono text-xs" style={{ color: t.sub }}>{p.sku || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: t.sub }}>{p.barcode || "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: t.text }}>{p.category || p.cat}</td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: t.text }}>{money(p.price)}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: t.text }}>{p.stock} <span style={{ color: t.sub }}>{p.unit}</span></td>
                    <td className="px-4 py-3"><Badge t={t} tone={st.tone}>{st.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {isAdministrator && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => { setViewOnly(true); setShowForm(p); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.sub }} aria-label={`View ${p.name}`}>
                            <Eye size={15} />
                          </button>
                          <button type="button" onClick={() => { setViewOnly(false); setShowForm(p); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.sub }} aria-label={`Edit ${p.name}`}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(p); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.danger }} aria-label={`Delete ${p.name}`}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-xs" style={{ borderTop: `1px solid ${t.border}`, color: t.sub }}>
          <span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filtered.length)} of {filtered.length} products</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40" style={{ background: t.bg }} aria-label="Previous page"><ChevronLeft size={14} /></button>
            <span className="px-2 font-semibold" style={{ color: t.text }}>{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-40" style={{ background: t.bg }} aria-label="Next page"><ChevronRight size={14} /></button>
          </div>
        </div>
      </Card>

      {showForm && <ProductFormModal t={t} product={showForm === true ? null : showForm} readOnly={viewOnly} authToken={sessionToken} onClose={() => setShowForm(false)} onCreated={refreshProducts} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.58)" }} role="presentation">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: t.card, border: `1px solid ${t.border}` }} role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-description">
            <div className="flex items-start gap-3 px-5 py-5" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: t.dangerSoft, color: t.danger }}><AlertTriangle size={20} /></div>
              <div className="min-w-0 flex-1"><h2 id="delete-product-title" className="font-bold" style={{ color: t.text }}>Delete product?</h2><p id="delete-product-description" className="text-sm mt-1" style={{ color: t.sub }}>This action will permanently remove the product from your catalog.</p></div>
              <button type="button" onClick={() => { setDeleteError(""); setDeleteTarget(null); }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: t.sub, background: t.bg }} aria-label="Close delete confirmation"><X size={17} /></button>
            </div>
            <div className="px-5 py-4" style={{ background: t.bg }}><p className="text-xs uppercase font-semibold" style={{ color: t.sub }}>Product to delete</p><p className="font-semibold mt-1 truncate" style={{ color: t.text }}>{deleteTarget.name}</p>{deleteTarget.barcode && <p className="text-xs mt-1 font-mono" style={{ color: t.sub }}>Barcode: {deleteTarget.barcode}</p>}</div>
            {deleteError && <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl px-3 py-3 text-sm" style={{ background: t.dangerSoft, border: `1px solid ${t.danger}`, color: t.danger }} role="alert"><AlertCircle size={17} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Product cannot be deleted</p><p className="text-xs mt-1" style={{ color: t.sub }}>{deleteError}</p></div></div>}
            <div className="flex justify-end gap-2 px-5 py-4"><Button t={t} type="button" variant="outline" onClick={() => { setDeleteError(""); setDeleteTarget(null); }} disabled={deleting}>Close</Button><Button t={t} type="button" variant="danger" onClick={handleDelete} disabled={deleting}><Trash2 size={14} />{deleting ? "Deleting..." : deleteError ? "Try Again" : "Delete Product"}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
