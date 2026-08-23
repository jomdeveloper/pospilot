import React, { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  ClipboardList,
  Eye,
  Filter,
  Package2,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import StockBar from "../components/ui/StockBar";
import { api } from "../../api";
import { money } from "../theme";

export default function PurchasesPage({ t }) {
  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productCategory, setProductCategory] = useState("all");
  const [productStockFilter, setProductStockFilter] = useState("needs-restock");
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  const load = () =>
    Promise.all([api.getPurchases(), api.getProducts(), api.getSuppliers()])
      .then(([nextPurchases, nextProducts, nextSuppliers]) => {
        setPurchases(nextPurchases);
        setProducts(nextProducts);
        setSuppliers(nextSuppliers);
        setSupplier((current) => current || nextSuppliers[0]?.name || "");
      })
      .catch((requestError) => setError(requestError.message));

  useEffect(() => {
    load();
  }, []);

  const selectedProduct = products.find(
    (product) => String(product.id) === productId,
  );
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty * line.unitCost, 0),
    [lines],
  );
  const productCategories = useMemo(
    () =>
      [
        ...new Set(products.map((product) => product.category).filter(Boolean)),
      ].sort(),
    [products],
  );
  const restockProducts = useMemo(
    () =>
      products
        .map((product) => {
          const stock = Number(product.stock || 0);
          const min = Number(product.reorder_level ?? product.min ?? 0);
          const max = Number(product.maximum_stock ?? product.max ?? 0);
          const status =
            stock === 0 ? "out-of-stock" : stock <= min ? "reorder" : "healthy";
          return {
            product,
            stock,
            min,
            max,
            needed: Math.max(0, max - stock),
            status,
          };
        })
        .filter(
          ({ product, status }) =>
            (productStockFilter === "all" || status !== "healthy") &&
            (productCategory === "all" ||
              product.category === productCategory) &&
            `${product.name} ${product.brand || ""} ${product.barcode || ""}`
              .toLowerCase()
              .includes(productQuery.trim().toLowerCase()),
        )
        .sort(
          (left, right) =>
            (left.status === "out-of-stock" ? 0 : 1) -
              (right.status === "out-of-stock" ? 0 : 1) ||
            left.stock - right.stock,
        ),
    [products, productCategory, productQuery, productStockFilter],
  );

  const addLine = () => {
    if (!selectedProduct || Number(qty) < 1 || Number(unitCost) < 0) return;
    if (lines.some((line) => line.productId === selectedProduct.id)) return;
    setLines([
      ...lines,
      {
        productId: selectedProduct.id,
        name: selectedProduct.name,
        qty: Number(qty),
        unitCost: Number(unitCost),
      },
    ]);
    setProductId("");
    setQty("1");
    setUnitCost("");
  };

  const chooseProduct = ({ product, stock, min, max, needed }) => {
    const existingLine = lines.find((line) => line.productId === product.id);
    if (existingLine) {
      setProductPickerOpen(false);
      return;
    }
    setProductId(String(product.id));
    setQty(String(needed || 1));
    setUnitCost(String(Number(product.cost_price ?? product.costPrice ?? 0)));
    setProductPickerOpen(false);
  };

  const toggleProductSelection = (productId) =>
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  const toggleAllProducts = () => {
    const visibleIds = restockProducts.map(({ product }) => product.id);
    setSelectedProductIds((current) =>
      visibleIds.every((id) => current.includes(id))
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  };
  const addSelectedProducts = () => {
    const selected = restockProducts.filter(
      ({ product }) =>
        selectedProductIds.includes(product.id) &&
        !lines.some((line) => line.productId === product.id),
    );
    if (!selected.length) return;
    setLines((current) => [
      ...current,
      ...selected.map(({ product, needed }) => ({
        productId: product.id,
        name: product.name,
        supplier: supplier || suppliers[0]?.name || "",
        qty: needed || 1,
        unitCost: Number(product.cost_price ?? product.costPrice ?? 0),
      })),
    ]);
    setSelectedProductIds([]);
    setProductPickerOpen(false);
  };

  const createPurchase = async () => {
    if (!lines.length)
      return setError("Add at least one product to the purchase.");
    const orderSupplier = lines[0].supplier;
    if (!orderSupplier || lines.some((line) => line.supplier !== orderSupplier)) return setError("Choose the same supplier for every product in this purchase order.");
    try {
      await api.createPurchase({ supplier: orderSupplier, items: lines });
      setLines([]);
      setError("");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const viewPurchase = async (purchase) => {
    setLoadingPurchase(true);
    setError("");
    try {
      setSelectedPurchase(await api.getPurchase(purchase.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingPurchase(false);
    }
  };

  const cancelPurchase = async () => {
    if (!selectedPurchase || selectedPurchase.status !== "Pending") return;
    try {
      const updated = await api.cancelPurchase(selectedPurchase.id);
      setSelectedPurchase(updated);
      setPurchases((current) =>
        current.map((purchase) =>
          purchase.id === updated.id
            ? { ...purchase, status: updated.status }
            : purchase,
        ),
      );
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card t={t} className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={18} style={{ color: t.primary }} />
          <h2 className="font-bold" style={{ color: t.text }}>
            Create Purchase Order
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="block">
            <button
              type="button"
              onClick={() => setProductPickerOpen(true)}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-left flex items-center justify-between gap-2"
              style={{
                background: t.bg,
                color: selectedProduct ? t.text : t.sub,
                border: `1px solid ${t.border}`,
              }}
            >
              <span className="truncate">
                {selectedProduct?.name || "Choose product to order"}
              </span>
              <Search size={15} />
            </button>
          </div>
        </div>
        {lines.length > 0 && (
          <div
            className="mt-4 border rounded-xl overflow-hidden"
            style={{ borderColor: t.border }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: t.bg }}>
                  {["Product", "Supplier", "Qty", "Unit cost", "Total", ""].map((heading) => <th key={heading} className="px-3 py-2 text-left text-[10px] uppercase tracking-wide whitespace-nowrap" style={{ color: t.sub }}>{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.productId}
                    style={{ borderBottom: `1px solid ${t.border}` }}
                  >
                    <td className="px-3 py-2 min-w-[180px]" style={{ color: t.text }}>
                      {line.name}
                    </td>
                    <td className="px-3 py-2 min-w-[180px]" style={{ color: t.sub }}>
                      <select value={line.supplier} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, supplier: event.target.value } : item))} className="w-full px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} aria-label={`Supplier for ${line.name}`}><option value="">Select supplier</option>{suppliers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
                    </td>
                    <td className="px-3 py-2" style={{ color: t.sub }}>
                      <input type="number" min="1" value={line.qty} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, qty: Math.max(1, Number(event.target.value) || 1) } : item))} className="w-20 px-2 py-1.5 rounded-lg text-center text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} aria-label={`Quantity for ${line.name}`} />
                    </td>
                    <td className="px-3 py-2" style={{ color: t.sub }}>
                      <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, unitCost: Math.max(0, Number(event.target.value) || 0) } : item))} className="w-24 px-2 py-1.5 rounded-lg text-right text-xs outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} aria-label={`Unit cost for ${line.name}`} />
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      style={{ color: t.text }}
                    >
                      {money(line.qty * line.unitCost)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() =>
                          setLines(
                            lines.filter(
                              (item) => item.productId !== line.productId,
                            ),
                          )
                        }
                        style={{ color: t.danger }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-3 py-3">
              <span className="text-xs font-semibold" style={{ color: t.sub }}>
                Order total
              </span>
              <span className="font-bold" style={{ color: t.text }}>
                {money(total)}
              </span>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs" style={{ color: t.danger }}>
            {error}
          </p>
        )}
        <div className="flex justify-end mt-4">
          <Button t={t} onClick={createPurchase} disabled={!lines.length}>
            Create Purchase Order
          </Button>
        </div>
      </Card>

      <Card t={t} className="overflow-hidden">
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${t.border}` }}
        >
          <div>
            <h2 className="font-bold" style={{ color: t.text }}>
              Purchase Orders
            </h2>
            <p className="text-xs mt-1" style={{ color: t.sub }}>
              Track supplier orders and receiving status
            </p>
          </div>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: t.primary, background: t.primarySoft }}
          >
            {purchases.length} orders
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr style={{ background: t.bg }}>
                {["PO number", "Supplier", "Date", "Total", "Status", ""].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="text-left px-4 py-3 text-[11px] uppercase tracking-wide"
                      style={{ color: t.sub }}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr
                  key={purchase.id}
                  onClick={() => viewPurchase(purchase)}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  style={{ borderTop: `1px solid ${t.border}` }}
                >
                  <td
                    className="px-4 py-3 font-semibold"
                    style={{ color: t.primary }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ClipboardList size={15} />
                      {purchase.po_number}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: t.sub }}>
                    {purchase.supplier}
                  </td>
                  <td className="px-4 py-3" style={{ color: t.sub }}>
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays size={14} />
                      {purchase.ordered_at}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 font-semibold"
                    style={{ color: t.text }}
                  >
                    {money(purchase.total)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      t={t}
                      tone={
                        purchase.status === "Received"
                          ? "success"
                          : purchase.status === "Cancelled"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {purchase.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        viewPurchase(purchase);
                      }}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors"
                      style={{ color: t.primary, background: t.primarySoft }}
                      aria-label={`View ${purchase.po_number}`}
                      title="View purchase order"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {purchases.length === 0 && (
          <p className="p-8 text-center text-sm" style={{ color: t.sub }}>
            No purchase orders yet.
          </p>
        )}
      </Card>
      {productPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.58)" }}
          role="presentation"
        >
          <div
            className="w-full max-w-6xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl shadow-2xl"
            style={{ background: t.card, border: `1px solid ${t.border}` }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-picker-title"
          >
            <div
              className="flex items-center justify-between px-6 py-5"
              style={{ borderBottom: `1px solid ${t.border}` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft, color: t.primary }}><Package2 size={22} /></div>
                <div>
                  <p
                  className="text-[10px] uppercase font-bold tracking-widest"
                  style={{ color: t.primary }}
                  >Purchase order</p>
                <h3
                  id="product-picker-title"
                  className="text-lg font-extrabold mt-0.5"
                  style={{ color: t.text }}
                >
                  Choose product to order
                </h3>
                <p className="text-xs mt-1" style={{ color: t.sub }}>
                  Products needing stock appear first. Healthy products are available in All products.
                </p>
              </div>
              </div>
              <button
                type="button"
                onClick={() => setProductPickerOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ color: t.sub, background: t.bg }}
                aria-label="Close product picker"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl p-3" style={{ background: t.bg, border: `1px solid ${t.border}` }}><div className="grid grid-cols-1 md:grid-cols-[1fr_180px_190px] gap-3">
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: t.sub }}
                  />
                  <input
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder="Search product, brand, or barcode"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      background: t.bg,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                    }}
                  />
                </div>
                <select
                  value={productCategory}
                  onChange={(event) => setProductCategory(event.target.value)}
                  className="px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <option value="all">All categories</option>
                  {productCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <select
                  value={productStockFilter}
                  onChange={(event) =>
                    setProductStockFilter(event.target.value)
                  }
                  className="px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <option value="needs-restock">Needs restock</option>
                  <option value="out-of-stock">Out of stock</option>
                  <option value="reorder">Reorder soon</option>
                  <option value="all">All products (manual)</option>
                </select>
              </div></div>
              <div className="flex items-center justify-between gap-3 text-xs" style={{ color: t.sub }}><label className="inline-flex items-center gap-2 font-semibold cursor-pointer" style={{ color: t.text }}><input type="checkbox" checked={restockProducts.length > 0 && restockProducts.every(({ product }) => selectedProductIds.includes(product.id))} onChange={toggleAllProducts} aria-label="Select all visible products" />Select all visible</label><span className="inline-flex items-center gap-2"><Filter size={14} /> {restockProducts.length} products shown</span></div>
              <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-1">
                {restockProducts.map(
                  ({ product, stock, min, max, needed, status }) => (
                    <label
                      key={product.id}
                      className="block w-full text-left rounded-xl p-3 transition-colors hover:border-blue-400 cursor-pointer"
                      style={{
                        background: selectedProductIds.includes(product.id) ? t.primarySoft : t.bg,
                        border: `1px solid ${t.border}`,
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={() => toggleProductSelection(product.id)} onClick={(event) => event.stopPropagation()} aria-label={`Select ${product.name}`} className="w-4 h-4 accent-blue-600" />
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.card, color: t.primary }}><Package2 size={19} /></div>
                        <div className="min-w-[180px] flex-1">
                          <p
                            className="font-semibold"
                            style={{ color: t.text }}
                          >
                            {product.name}
                          </p>
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: t.sub }}
                          >
                            {product.category || "General"} ·{" "}
                            {product.sku || product.barcode || "No SKU"}
                          </p>
                        </div>
                        <Badge
                          t={t}
                          tone={
                            status === "out-of-stock"
                              ? "danger"
                              : status === "reorder"
                                ? "warning"
                                : "success"
                          }
                        >
                          {status === "out-of-stock"
                            ? "Out of stock"
                            : status === "reorder"
                              ? "Reorder soon"
                              : "Healthy"}
                        </Badge>
                        <div className="w-36">
                          <StockBar t={t} pct={max ? (stock / max) * 100 : 0} />
                          <p
                            className="text-[11px] mt-1"
                            style={{ color: t.sub }}
                          >
                            Stock {stock} · Min {min} · Max {max || "-"}
                          </p>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <p
                            className="text-[10px] uppercase font-bold"
                            style={{ color: t.sub }}
                          >
                            Suggested order
                          </p>
                          <p
                            className="font-extrabold"
                            style={{ color: t.primary }}
                          >
                            {needed || 1} units
                          </p>
                        </div>
                      </div>
                    </label>
                  ),
                )}
                {restockProducts.length === 0 && (
                  <div
                    className="py-12 text-center text-sm"
                    style={{ color: t.sub }}
                  >
                    No products match this filter.
                  </div>
                )}
              </div>
            </div>
            <div
              className="flex items-center justify-between gap-3 px-5 py-4"
              style={{ borderTop: `1px solid ${t.border}` }}
            >
              <span className="text-xs font-semibold" style={{ color: t.sub }}>{selectedProductIds.length} selected</span>
              <div className="flex items-center gap-2">
              <Button
                t={t}
                type="button"
                variant="outline"
                onClick={() => setProductPickerOpen(false)}
              >
                Close
              </Button>
              <Button t={t} type="button" onClick={addSelectedProducts} disabled={!selectedProductIds.length}><Plus size={14} /> Add selected to order</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {loadingPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(15,23,42,0.35)" }}
        >
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: t.card, color: t.text }}
          >
            Loading purchase order...
          </div>
        </div>
      )}
      {selectedPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.58)" }}
          role="presentation"
        >
          <div
            className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl shadow-2xl"
            style={{ background: t.card, border: `1px solid ${t.border}` }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-detail-title"
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: `1px solid ${t.border}` }}
            >
              <div>
                <p
                  className="text-[10px] uppercase font-bold tracking-widest"
                  style={{ color: t.primary }}
                >
                  Purchase order
                </p>
                <h3
                  id="purchase-detail-title"
                  className="text-lg font-extrabold mt-0.5"
                  style={{ color: t.text }}
                >
                  {selectedPurchase.po_number}
                </h3>
                <p className="text-xs mt-1" style={{ color: t.sub }}>
                  {selectedPurchase.supplier} · {selectedPurchase.ordered_at}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchase(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ color: t.sub, background: t.bg }}
                aria-label="Close purchase order"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                <div className="rounded-xl p-3" style={{ background: t.bg }}>
                  <div
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold"
                    style={{ color: t.sub }}
                  >
                    <Store size={13} /> Supplier
                  </div>
                  <p
                    className="text-sm font-semibold mt-1 truncate"
                    style={{ color: t.text }}
                  >
                    {selectedPurchase.supplier}
                  </p>
                </div>
                <div className="rounded-xl p-3" style={{ background: t.bg }}>
                  <div
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold"
                    style={{ color: t.sub }}
                  >
                    <CalendarDays size={13} /> Ordered
                  </div>
                  <p
                    className="text-sm font-semibold mt-1 truncate"
                    style={{ color: t.text }}
                  >
                    {selectedPurchase.ordered_at}
                  </p>
                </div>
                <div className="rounded-xl p-3" style={{ background: t.bg }}>
                  <div
                    className="flex items-center gap-1.5 text-[10px] uppercase font-bold"
                    style={{ color: t.sub }}
                  >
                    <Package2 size={13} /> Items
                  </div>
                  <p
                    className="text-sm font-semibold mt-1"
                    style={{ color: t.text }}
                  >
                    {selectedPurchase.items?.length || 0}
                  </p>
                </div>
                <div
                  className="rounded-xl p-3"
                  style={{ background: t.primarySoft }}
                >
                  <div
                    className="text-[10px] uppercase font-bold"
                    style={{ color: t.primary }}
                  >
                    Order total
                  </div>
                  <p
                    className="text-sm font-extrabold mt-1"
                    style={{ color: t.text }}
                  >
                    {money(selectedPurchase.total)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <Badge
                  t={t}
                  tone={
                    selectedPurchase.status === "Received"
                      ? "success"
                      : selectedPurchase.status === "Cancelled"
                        ? "danger"
                        : "warning"
                  }
                >
                  {selectedPurchase.status}
                </Badge>
                <span className="text-xs" style={{ color: t.sub }}>
                  {selectedPurchase.status === "Pending"
                    ? "Awaiting receiving"
                    : selectedPurchase.status === "Received"
                      ? "Stock received"
                      : "Order closed"}
                </span>
              </div>
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${t.border}` }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: t.bg }}>
                      <th
                        className="text-left px-3 py-2 text-[11px] uppercase tracking-wide"
                        style={{ color: t.sub }}
                      >
                        Product
                      </th>
                      <th
                        className="text-right px-3 py-2 text-[11px] uppercase tracking-wide"
                        style={{ color: t.sub }}
                      >
                        Qty
                      </th>
                      <th
                        className="text-right px-3 py-2 text-[11px] uppercase tracking-wide"
                        style={{ color: t.sub }}
                      >
                        Unit cost
                      </th>
                      <th
                        className="text-right px-3 py-2 text-[11px] uppercase tracking-wide"
                        style={{ color: t.sub }}
                      >
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPurchase.items || []).map((item) => (
                      <tr
                        key={item.id}
                        style={{ borderTop: `1px solid ${t.border}` }}
                      >
                        <td className="px-3 py-2" style={{ color: t.text }}>
                          {item.name}
                        </td>
                        <td
                          className="px-3 py-2 text-right"
                          style={{ color: t.sub }}
                        >
                          {item.qty}
                        </td>
                        <td
                          className="px-3 py-2 text-right"
                          style={{ color: t.sub }}
                        >
                          {money(item.unit_cost)}
                        </td>
                        <td
                          className="px-3 py-2 text-right font-semibold"
                          style={{ color: t.text }}
                        >
                          {money(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div
              className="flex justify-end gap-2 px-5 py-4"
              style={{ borderTop: `1px solid ${t.border}` }}
            >
              <Button
                t={t}
                type="button"
                variant="outline"
                onClick={() => setSelectedPurchase(null)}
              >
                Close
              </Button>
              {selectedPurchase.status === "Pending" && (
                <Button
                  t={t}
                  type="button"
                  variant="danger"
                  onClick={cancelPurchase}
                >
                  <Ban size={14} /> Cancel order
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
