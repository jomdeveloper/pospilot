/**
 * products.js — DB-driven product catalog (PosPilot backend)
 * --------------------------------------------------------------------------
 * The cashier mode reads the LIVE product catalog from the PosPilot database
 * through the REST API. There is deliberately NO bundled sample catalog here —
 * every barcode/SKU lookup and every search hits the server, so the till
 * always reflects exactly what the admin sees in Products / Inventory.
 *
 * A product record shape (mapped from a normalized PosPilot row):
 *   {
 *     id:      number  - PosPilot product id (required by POST /sales),
 *     barcode: string  - scannable EAN / UPC,
 *     sku:     string  - internal product code,
 *     name:    string  - display name,
 *     price:   number  - unit price in PHP,
 *     category, productType, generic, stock,
 *     seniorDiscountEligible, pwdDiscountEligible
 *   }
 */
import { api } from "../../api";

/** Map a PosPilot server product row to the cashier POS product shape. */
function toPosProduct(row) {
  if (!row) return null;
  return {
    id: Number(row.id) || row.id,
    barcode: String(row.barcode || "").trim() || "",
    sku: String(row.sku || "").trim() || "SKU-" + row.id,
    name: row.name,
    price: Number(row.price) || 0,
    category: row.category || row.product_type || "General",
    productType: row.product_type || row.productType || "OTC",
    generic: row.generic || "",
    stock: Number(row.stock) || 0,
    seniorDiscountEligible: Boolean(row.senior_discount_eligible || row.seniorDiscountEligible),
    pwdDiscountEligible: Boolean(row.pwd_discount_eligible || row.pwdDiscountEligible),
    productId: Number(row.id) || row.id,
  };
}

/**
 * Resolve a single product by an EXACT barcode or SKU match from the database.
 * @param {string} code - barcode or sku (trimmed).
 * @returns {Promise<object|null>} the matched product or null.
 */
export async function findProductByCode(code) {
  const c = String(code || "").trim();
  if (!c) return null;

  // 1) Exact barcode lookup in the DB.
  try {
    const row = await api.getProductByBarcode(c);
    if (row) return toPosProduct(row);
  } catch (err) {
    // 404 = not found by barcode; other errors are handled by the search below.
  }

  // 2) Search the DB for an exact SKU (and a barcode the endpoint above missed
  //    due to case), then return null when the DB genuinely has no match.
  try {
    const res = await api.searchProducts({ q: c, limit: 20 });
    const rows = Array.isArray(res) ? res : ((res && res.items) || []);
    const lower = c.toLowerCase();
    const hit =
      rows.find((p) => String(p.barcode || "").toLowerCase() === lower) ||
      rows.find((p) => String(p.sku || "").toLowerCase() === lower) ||
      null;
    return toPosProduct(hit);
  } catch (err) {
    return null;
  }
}

/**
 * Search the LIVE catalog by name / sku / barcode / generic / brand.
 * @param {string} query
 * @param {number} limit - cap the number of results.
 * @returns {Promise<object[]>}
 */
export async function searchProducts(query, limit = 8) {
  const q = String(query || "").trim();
  if (!q) return [];
  try {
    const res = await api.searchProducts({ q, limit });
    const rows = Array.isArray(res) ? res : ((res && res.items) || []);
    return rows.map(toPosProduct).filter(Boolean).slice(0, limit);
  } catch (err) {
    return [];
  }
}