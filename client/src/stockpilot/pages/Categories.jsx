import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Baby,
  FolderPlus,
  HeartPulse,
  Package,
  Pencil,
  Pill,
  Plus,
  Scissors,
  Search,
  ShoppingBasket,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { api } from "../../api";

const CATEGORY_COLORS = [
  "#2563EB",
  "#16A34A",
  "#D97706",
  "#0891B2",
  "#DB2777",
  "#7C3AED",
];
const CATEGORY_ICONS = {
  Medicine: Pill,
  "Health & Wellness": HeartPulse,
  "Medical Products": Stethoscope,
  "Personal Care": Scissors,
  "Beauty & Baby": Baby,
  "Food & Beverage": ShoppingBasket,
  Services: Sparkles,
};

const SUBCATEGORY_FIELDS = [
  { name: "Expiry date", dataType: "date" },
  { name: "Storage condition", dataType: "text" },
  { name: "Batch/lot number", dataType: "text" },
  { name: "Prescription required", dataType: "boolean" },
  { name: "FDA registration number", dataType: "text" },
  { name: "Price per kilo", dataType: "number" },
  { name: "Net weight", dataType: "number" },
  { name: "Size", dataType: "text" },
  { name: "Color", dataType: "text" },
  { name: "Material", dataType: "text" },
  { name: "Warranty period", dataType: "number" },
  { name: "Serial number", dataType: "text" },
  { name: "Duration", dataType: "number" },
  { name: "Service fee", dataType: "number" },
  { name: "Linked component products", dataType: "text" },
];

export default function CategoriesPage({ t, sessionToken, loggedInRole }) {
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [productTypes, setProductTypes] = useState([]);
  const [status, setStatus] = useState("Active");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCategories = () => {
    setLoading(true);
    api
      .getCategories()
      .then(setCategories)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const filtered = useMemo(
    () =>
      categories.filter((category) =>
        category.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [categories, query],
  );
  const totalProducts = categories.reduce(
    (sum, category) => sum + category.productCount,
    0,
  );
  const totalStock = categories.reduce(
    (sum, category) => sum + category.stockTotal,
    0,
  );

  const closeForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setName("");
    setDescription("");
    setProductTypes([]);
    setStatus("Active");
    setError("");
  };

  const openCreateForm = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setProductTypes([]);
    setStatus("Active");
    setError("");
    setShowForm(true);
  };

  const openEditForm = (category) => {
    setEditingCategory(category);
    setName(category.name);
    setDescription(category.description || "");
    setProductTypes(category.productTypeDefinitions || (category.subcategories || category.productTypes || []).map((type) => ({ name: type, attributes: [] })));
    setStatus(category.status || "Active");
    setError("");
    setShowForm(true);
  };

  const addProductType = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    setProductTypes((current) => [
      ...current,
      {
        name: "",
        attributes: [],
      },
    ]);
  };
  const removeProductType = (event, typeIndex) => {
    event.preventDefault();
    event.stopPropagation();
    setProductTypes((current) =>
      current.filter((_, index) => index !== typeIndex),
    );
  };
  const updateProductType = (typeIndex, field, value) =>
    setProductTypes((current) =>
      current.map((type, index) =>
        index === typeIndex ? { ...type, [field]: value } : type,
      ),
    );
  const addAttribute = (event, typeIndex) => {
    event?.preventDefault();
    event?.stopPropagation();
    setProductTypes((current) =>
      current.map((type, index) =>
        index === typeIndex
          ? {
              ...type,
              attributes: [
                ...(type.attributes || []),
                { name: "", dataType: "text", required: false },
              ],
            }
          : type,
      ),
    );
  };
  const removeAttribute = (event, typeIndex, attributeIndex) => {
    event.preventDefault();
    event.stopPropagation();
    setProductTypes((current) =>
      current.map((type, index) =>
        index === typeIndex
          ? {
              ...type,
              attributes: (type.attributes || []).filter(
                (_, childIndex) => childIndex !== attributeIndex,
              ),
            }
          : type,
      ),
    );
  };
  const updateAttribute = (typeIndex, attributeIndex, field, value) =>
    setProductTypes((current) =>
      current.map((type, index) =>
        index === typeIndex
          ? {
              ...type,
              attributes: type.attributes.map((attribute, childIndex) =>
                childIndex === attributeIndex
                  ? { ...attribute, [field]: value }
                  : attribute,
              ),
            }
          : type,
      ),
    );

  const createCategory = async (event) => {
    event.preventDefault();
    if (!name.trim()) return setError("Enter a category name.");
    try {
      const normalizedProductTypes = productTypes
        .map((type) => ({
          ...type,
          name: type.name.trim(),
          attributes: type.attributes
            .filter((attribute) => attribute.name.trim())
            .map((attribute) => ({
              ...attribute,
              name: attribute.name.trim(),
            })),
        }))
        .filter((type) => type.name);

      const payload = {
        name: name.trim(),
        description: description.trim(),
        subcategories: normalizedProductTypes,
        productTypes: normalizedProductTypes,
        status,
      };
      if (editingCategory) await api.updateCategory(editingCategory.name, payload, sessionToken);
      else await api.createCategory(payload, sessionToken);
      closeForm();
      loadCategories();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const canEditCategories = ["administrator", "admin", "manager"].includes(
    String(loggedInRole || "").trim().toLowerCase(),
  );
  const canDeleteCategories = ["administrator", "admin"].includes(
    String(loggedInRole || "").trim().toLowerCase(),
  );

  const requestDeleteCategory = (category) => setDeleteTarget(category);

  const deleteCategory = async () => {
    if (!deleteTarget || deleting) return;
    try {
      setDeleting(true);
      await api.deleteCategory(deleteTarget.name, sessionToken);
      setDeleteTarget(null);
      loadCategories();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeleting(false);
    }
  };

  const productTypeEditor = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: t.sub }}>
          Subcategories & fields
        </span>
        <button
          type="button"
          onClick={addProductType}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: t.primarySoft, color: t.primary }}
        >
          <Plus size={13} /> Add subcategory
        </button>
      </div>
      <div className="space-y-3">
        {productTypes.map((type, typeIndex) => (
          <div
            key={typeIndex}
            className="rounded-xl p-3"
            style={{ background: t.bg, border: `1px solid ${t.border}` }}
          >
            <div className="flex items-center gap-2">
              <input
                value={type.name}
                onChange={(event) =>
                  updateProductType(typeIndex, "name", event.target.value)
                }
                placeholder="Subcategory name"
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: t.card,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                }}
              />
              <button
                type="button"
                onClick={(event) => removeProductType(event, typeIndex)}
                aria-label="Remove subcategory"
                style={{ color: t.danger }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-semibold"
                  style={{ color: t.sub }}
                >
                  Product fields
                </span>
                <button
                  type="button"
                  onClick={(event) => addAttribute(event, typeIndex)}
                  className="text-xs font-semibold"
                  style={{ color: t.primary }}
                >
                  + Add field
                </button>
              </div>
              {(type.attributes || []).map((attribute, attributeIndex) => (
                <div key={attributeIndex} className="flex items-center gap-2">
                  <select
                    value={attribute.name}
                    onChange={(event) => {
                      const selected = SUBCATEGORY_FIELDS.find((field) => field.name === event.target.value);
                      updateAttribute(typeIndex, attributeIndex, "name", event.target.value);
                      if (selected) updateAttribute(typeIndex, attributeIndex, "dataType", selected.dataType);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: t.card, color: t.text, border: `1px solid ${t.border}` }}
                  >
                    <option value="">Choose field</option>
                    {SUBCATEGORY_FIELDS.filter((field) =>
                      field.name === attribute.name || !(type.attributes || []).some((other) => other.name === field.name)
                    ).map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}
                  </select>
                  <select
                    value={attribute.dataType}
                    onChange={(event) =>
                      updateAttribute(
                        typeIndex,
                        attributeIndex,
                        "dataType",
                        event.target.value,
                      )
                    }
                    className="px-2 py-2 rounded-lg text-sm outline-none"
                    style={{
                      background: t.card,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    <option value="date">Date</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Yes / No</option>
                  </select>
                  <label
                    className="flex items-center gap-1 text-xs whitespace-nowrap"
                    style={{ color: t.sub }}
                  >
                    <input
                      type="checkbox"
                      checked={attribute.required}
                      onChange={(event) =>
                        updateAttribute(
                          typeIndex,
                          attributeIndex,
                          "required",
                          event.target.checked,
                        )
                      }
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={(event) => removeAttribute(event, typeIndex, attributeIndex)}
                    aria-label="Remove field"
                    style={{ color: t.sub }}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {productTypes.length === 0 && (
        <p className="text-xs mt-2" style={{ color: t.sub }}>
          Add a subcategory and its product fields.
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card t={t} className="p-5">
          <p className="text-2xl font-extrabold" style={{ color: t.text }}>
            {categories.length}
          </p>
          <p className="text-xs mt-1" style={{ color: t.sub }}>
            Total categories
          </p>
        </Card>
        <Card t={t} className="p-5">
          <p className="text-2xl font-extrabold" style={{ color: t.text }}>
            {totalProducts}
          </p>
          <p className="text-xs mt-1" style={{ color: t.sub }}>
            Products categorized
          </p>
        </Card>
        <Card t={t} className="p-5">
          <p className="text-2xl font-extrabold" style={{ color: t.text }}>
            {totalStock.toLocaleString()}
          </p>
          <p className="text-xs mt-1" style={{ color: t.sub }}>
            Units in stock
          </p>
        </Card>
      </div>

      <Card t={t} className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: t.sub }}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search categories…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: t.bg,
                color: t.text,
                border: `1px solid ${t.border}`,
              }}
            />
          </div>
          {canEditCategories && <Button t={t} onClick={openCreateForm}>
            <FolderPlus size={15} /> Add Category
          </Button>}
        </div>
      </Card>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: t.dangerSoft, color: t.danger }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <Card
          t={t}
          className="p-12 text-center text-sm"
          style={{ color: t.sub }}
        >
          Loading categories…
        </Card>
      ) : filtered.length === 0 ? (
        <Card
          t={t}
          className="p-12 text-center text-sm"
          style={{ color: t.sub }}
        >
          No categories found.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((category, index) => {
            const Icon = CATEGORY_ICONS[category.name] || Package;
            return (
              <Card key={category.name} t={t} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}18`,
                      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                    }}
                  >
                    <Icon size={32} strokeWidth={1.75} />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: t.bg, color: t.sub }}
                    >
                      {category.productCount} products
                    </span>
                    <div className="flex items-center gap-1">
                      {canEditCategories && <button type="button" onClick={() => openEditForm(category)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.primary, background: t.primarySoft }} aria-label={`Edit ${category.name}`} title="Edit category"><Pencil size={15} /></button>}
                      {canDeleteCategories && <button type="button" onClick={() => requestDeleteCategory(category)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.danger, background: t.dangerSoft }} aria-label={`Delete ${category.name}`} title="Delete category"><Trash2 size={15} /></button>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <h3 className="font-bold" style={{ color: t.text }}>
                    {category.name}
                  </h3>
                  <span
                    className="text-[10px] uppercase font-bold"
                    style={{
                      color:
                        category.status === "Inactive" ? t.danger : t.success,
                    }}
                  >
                    {category.status || "Active"}
                  </span>
                </div>
                <p className="text-sm mt-1" style={{ color: t.sub }}>
                  {category.description || "No description provided."}
                </p>
                <p className="text-sm mt-2" style={{ color: t.sub }}>
                  {category.stockTotal.toLocaleString()} units currently in
                  stock
                </p>
                {category.productTypes?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {category.productTypes.map((type) => (
                      <span
                        key={type}
                        className="text-[11px] px-2 py-1 rounded-md"
                        style={{ background: t.bg, color: t.sub }}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className="h-1.5 rounded-full mt-4"
                  style={{ background: t.border }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, category.productCount ? 35 + category.productCount * 4 : 4)}%`,
                      background:
                        CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.5)" }}
        >
          <form
            className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl p-5 flex flex-col"
            style={{ background: t.card }}
            onSubmit={createCategory}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold" style={{ color: t.text }}>
                  {editingCategory ? "Edit Category" : "Add Category"}
                </h3>
                <p className="text-xs mt-1" style={{ color: t.sub }}>
                  Define the category and the product types available under it.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                style={{ color: t.sub }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="block col-span-2">
                <span
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: t.sub }}
                >
                  Category name *
                </span>
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: Outdoor & Recreation"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                  }}
                />
              </label>
              <label className="block col-span-2">
                <span
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: t.sub }}
                >
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What kind of products belong in this category?"
                  rows="3"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                  style={{
                    background: t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                  }}
                />
              </label>
              <label className="block col-span-2">
                <div className="max-h-[min(42vh,360px)] overflow-y-auto pr-1">
                  {productTypeEditor}
                  <span
                    className="text-[11px] mt-1 block"
                    style={{ color: t.sub }}
                  >
                    Product types and fields are saved as JSON for product setup.
                  </span>
                </div>
              </label>
              <label className="block">
                <span
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: t.sub }}
                >
                  Status
                </span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{
                    background: t.bg,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
            </div>
            {error && (
              <p className="text-xs mt-3" style={{ color: t.danger }}>
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <Button t={t} type="button" variant="outline" onClick={closeForm}>
                Cancel
              </Button>
                <Button t={t} type="submit">
                {editingCategory ? "Update Category" : "Save Category"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.58)" }} role="presentation">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: t.card, border: `1px solid ${t.border}` }} role="alertdialog" aria-modal="true" aria-labelledby="delete-category-title" aria-describedby="delete-category-description">
            <div className="flex items-start gap-3 px-5 py-5" style={{ borderBottom: `1px solid ${t.border}` }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: t.dangerSoft, color: t.danger }}><AlertTriangle size={22} /></div>
              <div className="flex-1"><h3 id="delete-category-title" className="font-bold" style={{ color: t.text }}>Delete category?</h3><p id="delete-category-description" className="text-sm mt-1" style={{ color: t.sub }}>You are about to delete <strong style={{ color: t.text }}>{deleteTarget.name}</strong>. This action removes the category and its product types.</p></div>
              <button type="button" onClick={() => setDeleteTarget(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: t.sub, background: t.bg }} aria-label="Close delete dialog" title="Close"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 text-xs" style={{ color: t.sub, background: t.bg }}>Categories with products cannot be deleted.</div>
            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: `1px solid ${t.border}` }}><Button t={t} type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button><Button t={t} type="button" variant="danger" onClick={deleteCategory} disabled={deleting}><Trash2 size={14} /> {deleting ? "Deleting..." : "Delete category"}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
