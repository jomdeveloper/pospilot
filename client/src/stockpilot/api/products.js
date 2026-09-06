import { api } from "../../api";

export async function getProducts() {
  const rows = await api.getProducts();
  return rows.map((product) => ({
    ...product,
    brand: product.brand || product.generic || "",
    cat: product.category || "General",
    form: product.product_type || "General",
    unit: "unit",
    min: Number(product.reorder_level ?? product.reorderLevel ?? 0),
    img: "📦",
  }));
}

export async function createProduct(product) {
  return api.createProduct(product);
}

export async function updateProduct(id, product, authToken) {
  return api.updateProduct(id, product, authToken);
}

export async function deleteProduct(id, authToken) {
  return api.deleteProduct(id, authToken);
}

export async function getProductMetadata() {
  return api.getProductMetadata();
}
