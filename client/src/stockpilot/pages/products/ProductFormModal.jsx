import React, { useEffect, useState } from "react";
import { AlertCircle, Baby, HeartPulse, Package, Pill, Scissors, ShoppingBasket, Sparkles, Stethoscope, X } from "lucide-react";
import Button from "../../components/ui/Button";
import { createProduct, getProductMetadata, updateProduct } from "../../api/products";

const initialForm = {
  name: "",
  brand: "",
  barcode: "",
  imageUrl: "",
  category: "",
  subcategory: "",
  unitOfMeasure: "unit",
  packSize: "",
  productType: "",
  costPrice: "",
  price: "",
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
      costPrice: String(product.costPrice ?? product.cost_price ?? ""),
      price: String(product.price ?? ""),
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
    const unitOfMeasure = form.unitOfMeasure.trim();
    const costPrice = Number(form.costPrice);
    const price = Number(form.price);
    const stock = Number(form.stock);
    const requiredAttribute = !product && selectedType?.attributes?.find((attribute) => {
      if (!attribute.required) return false;
      if (attribute.data_type === "boolean") return attributes[attribute.name] !== true;
      return !String(attributes[attribute.name] ?? "").trim();
    });

    if (!name) {
      setTab("general");
      setError("Product name is required.");
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
    if (!isService && (!form.stock.trim() || !Number.isInteger(stock) || stock <= 0)) {
      setTab("inventory");
      setError("Opening stock must be a whole number greater than 0.");
      return;
    }
    const reorderLevel = Number(form.reorderLevel);
    const maximumStock = Number(form.maximumStock);
    if (!isService && (!form.reorderLevel.trim() || !Number.isInteger(reorderLevel) || reorderLevel <= 0)) {
      setTab("inventory");
      setError("Reorder level must be a whole number greater than 0.");
      return;
    }
    if (!isService && (!form.maximumStock.trim() || !Number.isInteger(maximumStock) || maximumStock <= 0)) {
      setTab("inventory");
      setError("Maximum stock must be a whole number greater than 0.");
      return;
    }
    if (requiredAttribute) {
      setTab("specific");
      setError(`${requiredAttribute.name} is required.`);
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, price, costPrice, stock, attributes, imageUrl: resolveImageUrl(form.category, form.imageUrl) };
      if (product) {
        await updateProduct(product.id, payload, authToken);
      } else {
        await createProduct(payload);
      }
      onCreated?.();
      onClose();
    } catch (saveError) {
      setError(/\b413\b/.test(saveError.message) ? "Image is too large. Please choose an image no larger than 1 MB." : saveError.message);
      if (/\b413\b/.test(saveError.message)) setTab("image");
    } finally {
      setSaving(false);
    }
  };

  const input = (label, name, type = "text", required = false) => (
    <label className="block">
      <span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{label}{required ? " *" : ""}</span>
      <input name={name} value={form[name]} onChange={update} type={type} required={required} disabled={readOnly}
        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
    </label>
  );

  const checkbox = (name) => (
    <label key={name} className="flex items-center gap-2 text-sm" style={{ color: t.text }}>
      <input type="checkbox" name={name} checked={Boolean(form[name])} disabled={readOnly} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.checked }))} />
      {name.replace(/([A-Z])/g, " $1")}
    </label>
  );

  const selectedType = productTypes.find((type) => type.name === form.productType);
  const availableTypes = productTypes.filter((type) => type.category_name === form.category);
  const isService = form.category === "Services";

  return (
    <div className="product-modal fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
      <form onSubmit={handleSave} className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: t.card }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${t.border}` }}>
          <h3 className="font-bold" style={{ color: t.text }}>{readOnly ? "View Product" : product ? "Edit Product" : "Add New Product"}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.sub, background: t.bg }}><X size={16} /></button>
        </div>
        <div className="product-modal-tabs flex gap-1 px-5 pt-3 overflow-x-auto" style={{ borderBottom: `1px solid ${t.border}` }}>
          {[['general', 'General'], ['image', 'Image'], ['specific', 'Product-Specific'], ['pricing', 'Pricing'], ['inventory', 'Inventory'], ['discounts', 'Discounts']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="px-3 py-2 text-xs font-semibold whitespace-nowrap rounded-t-lg -mb-px" style={{ color: tab === id ? t.primary : t.sub, borderBottom: tab === id ? `2px solid ${t.primary}` : "2px solid transparent" }}>{label}</button>
          ))}
        </div>
        <div className="p-5 min-h-[280px]">
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
            {input("Product Name", "name", "text", true)}
            {input("Barcode", "barcode")}
            {input("Brand", "brand")}
            {input("Subcategory", "subcategory")}
            {input("Unit of Measure", "unitOfMeasure", "text", true)}
            {input("Pack Size", "packSize")}
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Category *</span><select name="category" value={form.category} required disabled={readOnly} onChange={(event) => { setForm((current) => ({ ...current, category: event.target.value, productType: "", trackInventory: event.target.value !== "Services", trackBatch: false, trackExpiry: false, trackSerial: false })); setAttributes({}); }} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Select category</option>{categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}</select></label>
            <label className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>Product Type *</span><select name="productType" value={form.productType} required disabled={readOnly || !form.category} onChange={(event) => { update(event); setAttributes({}); }} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}><option value="">Select product type</option>{availableTypes.map((type) => <option key={type.id || type.name} value={type.name}>{type.name}</option>)}</select></label>
          </div>}
          {tab === "specific" && <div className="grid grid-cols-2 gap-4">{selectedType?.attributes?.length ? selectedType.attributes.map((attribute) => <label key={attribute.id || attribute.name} className="block"><span className="text-xs font-semibold mb-1 block" style={{ color: t.sub }}>{attribute.name}{attribute.required ? " *" : ""}</span>{attribute.data_type === "boolean" ? <input type="checkbox" required={Boolean(attribute.required)} disabled={readOnly} checked={Boolean(attributes[attribute.name])} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.name]: event.target.checked }))} /> : <input required={Boolean(attribute.required)} disabled={readOnly} value={attributes[attribute.name] || ""} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.name]: event.target.value }))} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />}</label>) : <p className="col-span-2 text-sm" style={{ color: t.sub }}>No product-specific fields are configured for this type.</p>}</div>}
          {tab === "pricing" && <div className="grid grid-cols-2 gap-4">{input("Cost Price", "costPrice", "number", true)}{input("Selling Price", "price", "number", true)}</div>}
          {tab === "inventory" && (isService ? <p className="text-sm" style={{ color: t.sub }}>Services do not use inventory, batch, expiry, or serial tracking.</p> : <div className="grid grid-cols-2 gap-4">{input("Opening Stock", "stock", "number", true)}{input("Reorder Level", "reorderLevel", "number", true)}{input("Maximum Stock", "maximumStock", "number", true)}{checkbox("trackInventory")}{checkbox("trackBatch")}{checkbox("trackExpiry")}{checkbox("trackSerial")}</div>)}
          {tab === "discounts" && <div className="grid grid-cols-2 gap-4">{checkbox("seniorDiscountEligible")}{checkbox("pwdDiscountEligible")}{checkbox("promoEligible")}{checkbox("loyaltyEligible")}</div>}
          {error && <div className="col-span-2 mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: t.dangerSoft, border: `1px solid ${t.danger}`, color: t.danger }} role="alert"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${t.border}` }}>
          <Button t={t} type="button" variant="outline" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</Button>
          {!readOnly && <Button t={t} type="submit" disabled={saving}>{saving ? "Saving..." : product ? "Update Product" : "Save Product"}</Button>}
        </div>
      </form>
    </div>
  );
}
