import React, { useEffect, useState } from "react";
import { AlertCircle, Baby, HeartPulse, LoaderCircle, Package, Pill, Scissors, ShoppingBasket, Sparkles, Stethoscope, X } from "lucide-react";
import Button from "../../components/ui/Button";
import { createProduct, getProductMetadata, updateProduct } from "../../api/products";

const initialForm = {
  name: "",
  brand: "",
  barcode: "",
  imageUrl: "",
  category: "",
  description: "",
  unitOfMeasure: "unit",
  packSize: "",
  productType: "",
  costPrice: "",
  price: "",
  taxType: "VATABLE",
  stock: "",
  reorderLevel: "",
  maximumStock: "",
  trackInventory: true,
  trackBatch: false,
  trackExpiry: false,
  trackSerial: false,
  seniorDiscountEligible: false,
  pwdDiscountEligible: false,
  promoEligible: true,
  loyaltyEligible: true,
};

const DELIVERY_FIELDS = new Set(["Expiry date", "Storage condition", "Batch/lot number", "Serial number", "Warranty period"]);
const PRODUCT_TABS = [
  ["general", "General"],
  ["image", "Image"],
  ["specific", "Product-Specific"],
  ["pricing", "Pricing"],
  ["inventory", "Inventory"],
  ["discounts", "Discounts"],
];

export default function ProductFormModal({ t, product, readOnly = false, authToken, onClose, onCreated }) {
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [productTypes, setProductTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [attributes, setAttributes] = useState({});
  const [imagePreview, setImagePreview] = useState("");

  const categoryDefaultIcon = (categoryName) => {
    const map = {
      Medicine: Pill,
      "Health & Wellness": HeartPulse,
      "Medical Products": Stethoscope,
      "Personal Care": Scissors,
      "Beauty & Baby": Baby,
      "Food & Beverage": ShoppingBasket,
      Services: Sparkles,
    };
    return map[categoryName] || Package;
  };

  const resolveImageUrl = (categoryName, preferredUrl) => {
    if (preferredUrl && preferredUrl.trim()) return preferredUrl.trim();
    return "";
  };

  useEffect(() => {
    if (!product) {
      setForm(initialForm);
      setTab("general");
      setAttributes({});
      setImagePreview("");
      return;
    }

    setForm({
      ...initialForm,
      ...product,
      unitOfMeasure: product.unitOfMeasure || product.unit_of_measure || "unit",
      productType: product.productType || product.product_type || "",
      description: product.description || product.subcategory || "",
      packSize: product.packSize ?? product.pack_size ?? "",
      trackInventory: Boolean(product.trackInventory ?? product.track_inventory ?? true),
      trackBatch: Boolean(product.trackBatch ?? product.track_batch),
      trackExpiry: Boolean(product.trackExpiry ?? product.track_expiry),
      trackSerial: Boolean(product.trackSerial ?? product.track_serial),
      costPrice: String(product.costPrice ?? product.cost_price ?? ""),
      price: String(product.price ?? ""),
      taxType: String(product.taxType || product.tax_type || "VATABLE").toUpperCase(),
      stock: String(product.stock ?? "0"),
      reorderLevel: String(product.reorderLevel ?? product.reorder_level ?? "0"),
      maximumStock: String(product.maximumStock ?? product.maximum_stock ?? ""),
      imageUrl: product.imageUrl || product.image_url || "",
    });
    setTab("general");
    setAttributes(product.attributes || {});
    setImagePreview(resolveImageUrl(product.category, product.imageUrl || product.image_url));
  }, [product]);

  useEffect(() => {
    const nextPreview = resolveImageUrl(form.category, form.imageUrl);
    setImagePreview(nextPreview);
  }, [form.category, form.imageUrl]);

  useEffect(() => {
    getProductMetadata().then((data) => {
      setProductTypes(data.productTypes || []);
      setCategories(data.categories || []);
    }).catch((requestError) => setError(requestError.message));
  }, []);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      event.target.value = "";
      setTab("image");
      setError("Image is too large. Please choose an image no larger than 1 MB.");
      return;
    }

    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setForm((current) => ({ ...current, imageUrl: value }));
      setImagePreview(value);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (readOnly) return;
    setError("");

    const name = form.name.trim();
    const brand = form.brand.trim();
    const unitOfMeasure = form.unitOfMeasure.trim();
    const costPrice = Number(form.costPrice);
    const price = Number(form.price);
    const stock = Number(form.stock);
    const requiredAttribute = selectedType?.attributes?.find((attribute) => {
      if (DELIVERY_FIELDS.has(attribute.name)) return false;
      if (!attribute.required) return false;
      if (attribute.data_type === "boolean") return attributes[attribute.name] !== true;
      return !String(attributes[attribute.name] ?? "").trim();
    });

    if (!name) {
      setTab("general");
      setError("Product name is required.");
      return;
    }
    if (!brand) {
      setTab("general");
      setError("Brand is required.");
      return;
    }
    if (!unitOfMeasure) {
      setTab("general");
      setError("Unit of measure is required.");
      return;
    }
    if (!form.category || !form.productType) {
      setTab("general");
      setError("Category and product type are required.");
      return;
    }
    if (!form.costPrice.trim() || !Number.isFinite(costPrice) || costPrice < 0) {
      setTab("pricing");
      setError("Enter a valid cost price.");
      return;
    }
    if (!form.price.trim() || !Number.isFinite(price) || price < 0) {
      setTab("pricing");
      setError("Enter a valid selling price.");
      return;
    }
    const tracksInventory = !isService && form.trackInventory;
    // When EDITING a product, the current-stock field is read-only and the POS
    // legitimately sells stock below zero (reconciled via Stock Adjustment), so
    // never gate the save on the stock value — only new products require a
    // non-negative opening-stock input.
    if (!product && tracksInventory && (!form.stock.trim() || !Number.isInteger(stock) || stock < 0)) {
      setTab("inventory");
      setError("Opening stock must be a whole number of zero or more.");
      return;
    }
    const reorderLevel = Number(form.reorderLevel);
    const maximumStock = Number(form.maximumStock);
    if (tracksInventory && form.reorderLevel.trim() && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) {
      setTab("inventory");
      setError("Reorder level must be a whole number of zero or more.");
      return;
    }
    if (tracksInventory && form.maximumStock.trim() && (!Number.isInteger(maximumStock) || maximumStock < reorderLevel)) {
      setTab("inventory");
      setError("Maximum stock must be greater than or equal to reorder level.");
      return;
    }
    if (form.trackExpiry && !form.trackBatch) {
      setTab("inventory");
      setError("Enable batch tracking before enabling expiry tracking.");
      return;
    }
    if (requiredAttribute) {
      setTab("specific");
      setError(`${requiredAttribute.name} is required.`);
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, brand, price, costPrice, stock: product ? undefined : stock, attributes, imageUrl: resolveImageUrl(form.category, form.imageUrl) };
      const saveRequest = product
        ? updateProduct(product.id, payload, authToken)
        : createProduct(payload);
      await Promise.all([
        saveRequest,
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      onCreated?.();
      onClose();
    } catch (saveError) {
      setError(/\b413\b/.test(saveError.message) ? "Image is too large. Please choose an image no larger than 1 MB." : saveError.message);
      if (/\b413\b/.test(saveError.message)) setTab("image");
    } finally {
      setSaving(false);
    }
  };

  const input = (label, name, type = "text", required = false, step, min) => (
    <label className="block">
      <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{label}{required ? " *" : ""}</span>
      <input name={name} value={form[name]} onChange={update} type={type} step={step} min={min} required={required} disabled={readOnly}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
    </label>
  );

  const checkbox = (name) => (
    <label key={name} className="flex items-center gap-2 text-sm" style={{ color: t.text }}>
      <input type="checkbox" name={name} checked={Boolean(form[name])} disabled={readOnly} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.checked }))} />
      {name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}
    </label>
  );

  const selectedType = productTypes.find((type) => type.name === form.productType);
  const availableTypes = productTypes.filter((type) => type.category_name === form.category);
  const isService = form.category === "Services";
  const isFinalTab = tab === PRODUCT_TABS[PRODUCT_TABS.length - 1][0];
  const goToNextTab = () => {
    const currentIndex = PRODUCT_TABS.findIndex(([id]) => id === tab);
    if (currentIndex < PRODUCT_TABS.length - 1) setTab(PRODUCT_TABS[currentIndex + 1][0]);
  };

  return (
    <div className="product-modal fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <form onSubmit={(event) => event.preventDefault()} className="w-full max-w-2xl h-[min(720px,calc(100vh-2rem))] rounded-2xl overflow-hidden flex flex-col" style={{ background: t.card }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${t.border}` }}>
          <h3 className="font-bold" style={{ color: t.text }}>{readOnly ? "View Product" : product ? "Edit Product" : "Add New Product"}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.sub, background: t.bg }}><X size={16} /></button>
        </div>
        <div className="product-modal-tabs flex gap-1 px-5 pt-3 overflow-x-auto" style={{ borderBottom: `1px solid ${t.border}` }}>
          {PRODUCT_TABS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg -mb-px" style={{ color: tab === id ? t.primary : t.sub, borderBottom: tab === id ? `2px solid ${t.primary}` : "2px solid transparent" }}>{label}</button>
          ))}
        </div>
        <div className="p-5 flex-1 min-h-0 overflow-y-auto">
          {tab === "image" && <div className="flex items-center gap-4 rounded-2xl p-3" style={{ background: t.bg, border: `1px solid ${t.border}` }}>
              {imagePreview ? <img src={imagePreview} alt="Product preview" className="h-20 w-20 rounded-xl object-cover" style={{ border: `1px solid ${t.border}` }} onError={() => setImagePreview("")} /> : (() => {
                const DefaultIcon = categoryDefaultIcon(form.category || "General Merchandise");
                return <div className="h-20 w-20 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft, color: t.primary, border: `1px solid ${t.border}` }} aria-label="Default product icon"><DefaultIcon size={32} strokeWidth={1.75} /></div>;
              })()}
              <div className="flex-1">
                <div className="text-xs font-semibold mb-1" style={{ color: t.sub }}>Product Image</div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium cursor-pointer" style={{ background: t.primary, color: "#fff" }}>
                    Upload image
                    <input type="file" accept="image/*" onChange={handleImageSelection} className="hidden" disabled={readOnly} />
                  </label>
                  <span className="text-xs" style={{ color: t.sub }}>Uses category default when no image is uploaded.</span>
                </div>
              </div>
            </div>}
          {tab === "general" && <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Category *</span><select name="category" value={form.category} required disabled={readOnly} onChange={(event) => { setForm((current) => ({ ...current, category: event.target.value, productType: "", trackInventory: event.target.value !== "Services", trackBatch: false, trackExpiry: false, trackSerial: false })); setAttributes({}); }} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Select category</option>{categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}</select></label>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Subcategory *</span><select name="productType" value={form.productType} required disabled={readOnly || !form.category} onChange={(event) => { update(event); setAttributes({}); }} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Select subcategory</option>{availableTypes.map((type) => <option key={type.id || type.name} value={type.name}>{type.name}</option>)}</select></label>
            {input("Product Name", "name", "text", true)}
            {input("Barcode", "barcode")}
            {input("Brand", "brand", "text", true)}
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Unit of Measure *</span><select name="unitOfMeasure" value={form.unitOfMeasure} required disabled={readOnly} onChange={update} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Select unit</option>{["unit", "tablet", "capsule", "bottle", "box", "pack", "piece", "pair", "ampoule", "vial", "tube", "sachet", "gram", "kilogram", "milliliter", "liter"].map((unit) => <option key={unit} value={unit}>{unit.charAt(0).toUpperCase() + unit.slice(1)}</option>)}</select></label>
              {input("Pack Size", "packSize", "number", false, "1", "0")}
            </div>
            <label className="block col-span-2"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Product Description</span><textarea name="description" value={form.description} onChange={update} disabled={readOnly} rows="3" placeholder="Optional product details" className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} /></label>
          </div>}
          {tab === "specific" && <div className="grid grid-cols-2 gap-4">{selectedType?.attributes?.filter((attribute) => !DELIVERY_FIELDS.has(attribute.name)).length ? selectedType.attributes.filter((attribute) => !DELIVERY_FIELDS.has(attribute.name)).map((attribute) => { const dataType = attribute.data_type || attribute.dataType || "text"; return <label key={attribute.id || attribute.name} className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{attribute.name}{attribute.required ? " *" : ""}</span>{dataType === "boolean" ? <select required={Boolean(attribute.required)} disabled={readOnly} value={attributes[attribute.name] === true ? "yes" : attributes[attribute.name] === false ? "no" : ""} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.name]: event.target.value === "yes" }))} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select> : <input required={Boolean(attribute.required)} disabled={readOnly} type={dataType === "number" ? "number" : dataType === "date" ? "date" : "text"} value={attributes[attribute.name] ?? ""} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.name]: event.target.value }))} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />}</label>; }) : <p className="col-span-2 text-sm" style={{ color: t.sub }}>No product fields are configured for this subcategory. Delivery fields are entered during receiving.</p>}</div>}
          {tab === "pricing" && <div className="grid grid-cols-2 gap-4">{input("Cost Price", "costPrice", "number", true)}<div>{input("Selling Price", "price", "number", true)}<label className="block mt-4"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Tax Treatment *</span><select name="taxType" value={form.taxType} onChange={update} required disabled={readOnly} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="VATABLE">VATable (12%)</option><option value="EXEMPT">VAT-Exempt</option><option value="ZERO_RATED">Zero-Rated (0%)</option><option value="NON_VAT">Non-VAT</option></select></label></div></div>}
          {tab === "inventory" && (isService ? <p className="text-sm" style={{ color: t.sub }}>Services do not use inventory, batch, expiry, or serial tracking.</p> : <div className="grid grid-cols-2 gap-4">{product ? <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Current Stock</span><input value={form.stock} readOnly className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.sub, border: `1px solid ${t.border}` }} /><span className="text-[11px] mt-1 block" style={{ color: t.primary }}>Use Receiving or Stock Adjustment to change inventory.</span></label> : input("Opening Stock", "stock", "number", false)}{input("Reorder Level", "reorderLevel", "number", false)}{input("Maximum Stock", "maximumStock", "number", false)}<div className="col-span-2 border-t pt-4 mt-1" style={{ borderColor: t.border }}><div className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: t.text }}>Product Tracking</div><div className="flex flex-wrap items-center gap-x-5 gap-y-3">{checkbox("trackInventory")}{checkbox("trackBatch")}{checkbox("trackExpiry")}{checkbox("trackSerial")}</div><p className="text-[11px] mt-3" style={{ color: t.sub }}>Configure how this product is tracked during receiving and sales.</p></div></div>)}
          {tab === "discounts" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{checkbox("seniorDiscountEligible")}{checkbox("pwdDiscountEligible")}{checkbox("promoEligible")}{checkbox("loyaltyEligible")}</div>}
          {error && <div className="col-span-2 mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: t.dangerSoft, border: `1px solid ${t.danger}`, color: t.danger }} role="alert"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 shrink-0" style={{ borderTop: `1px solid ${t.border}` }}>
          <Button t={t} type="button" variant="outline" onClick={onClose} className="w-36 justify-center whitespace-nowrap">{readOnly ? "Close" : "Cancel"}</Button>
          {!readOnly && <div className="flex items-center gap-2">
            <Button t={t} type="button" variant="outline" onClick={() => setTab(PRODUCT_TABS[Math.max(0, PRODUCT_TABS.findIndex(([id]) => id === tab) - 1)][0])} disabled={tab === PRODUCT_TABS[0][0] || saving} className="w-36 justify-center whitespace-nowrap">Back</Button>
            <Button t={t} type="button" onClick={isFinalTab ? handleSave : goToNextTab} disabled={saving} className="w-36 justify-center whitespace-nowrap">{isFinalTab ? (saving ? <><LoaderCircle size={15} className="animate-spin" style={{ animationDuration: "1.8s" }} aria-hidden="true" /> Saving...</> : product ? "Update Product" : "Save Product") : "Next"}</Button>
          </div>}
        </div>
      </form>
    </div>
  );
}
