/**
 * Modular product search query builder.
 * Extend by adding entries to FILTER_HANDLERS or SEARCH_FIELDS.
 */

const SEARCH_FIELDS = ['name', 'generic', 'barcode', 'sku', 'brand'];

const STOCK_STATUS_SQL = {
  in_stock: 'stock >= 20',
  low_stock: 'stock > 0 AND stock < 20',
  out_of_stock: 'stock <= 0',
};

function isNumericQuery(value) {
  return /^\d+$/.test((value || '').trim());
}

function hasExplicitFilters(params = {}) {
  return ['category', 'brand', 'minPrice', 'maxPrice', 'stockStatus', 'expBefore'].some(
    (key) => Boolean(params[key])
  );
}

function parseExpToSortKey(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  // ISO dates, e.g. 2026-03 or 2026-03-15
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    if (month < 1 || month > 12) return null;
    return year * 12 + month;
  }

  // Month-name forms, e.g. "MAR 2026", "Mar 26", "MAR.2026"
  const match = trimmed.match(/^([A-Z]{3})[.\s]*(\d{2,4})$/i);
  if (!match) return null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthIndex = months.indexOf(match[1].toUpperCase());
  if (monthIndex === -1) return null;
  let year = Number(match[2]);
  if (year < 100) year += 2000;
  return year * 12 + (monthIndex + 1);
}

/**
 * Build WHERE clause and bindings from search/filter params.
 */
function buildProductSearchQuery(params = {}) {
  const conditions = [];
  const bindings = [];

  const q = (params.q || '').trim();
  const hasFilters = hasExplicitFilters(params);

  if (q) {
    if (isNumericQuery(q)) {
      conditions.push('(barcode = ? OR sku = ?)');
      bindings.push(q, q);
    } else {
      const like = `%${q}%`;
      const searchClause = SEARCH_FIELDS.map((field) => `${field} LIKE ?`).join(' OR ');
      conditions.push(`(${searchClause})`);
      SEARCH_FIELDS.forEach(() => bindings.push(like));
    }
  } else if (!hasFilters) {
    conditions.push('stock > 0');
  }

  if (params.category) {
    conditions.push('category = ?');
    bindings.push(params.category);
  }

  if (params.brand) {
    conditions.push('(brand = ? OR (brand IS NULL AND generic = ?))');
    bindings.push(params.brand, params.brand);
  }

  if (params.minPrice !== undefined && params.minPrice !== '') {
    const min = Number(params.minPrice);
    if (!Number.isNaN(min)) {
      conditions.push('price >= ?');
      bindings.push(min);
    }
  }

  if (params.maxPrice !== undefined && params.maxPrice !== '') {
    const max = Number(params.maxPrice);
    if (!Number.isNaN(max)) {
      conditions.push('price <= ?');
      bindings.push(max);
    }
  }

  if (params.stockStatus && STOCK_STATUS_SQL[params.stockStatus]) {
    conditions.push(`(${STOCK_STATUS_SQL[params.stockStatus]})`);
  }

  // NOTE: expiry filtering happens in JS against inventory_batches (see
  // filterByExpiration), because products don't carry an `exp` column.

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where, bindings, expBefore: params.expBefore || null };
}

function filterByExpiration(rows, expBefore) {
  if (!expBefore) return rows;
  const cutoffKey = parseExpToSortKey(expBefore);
  if (cutoffKey === null) return rows;

  return rows.filter((row) => {
    const key = parseExpToSortKey(row.exp);
    return key !== null && key <= cutoffKey;
  });
}

function paginateRows(rows, page, limit) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * limit;
  const items = rows.slice(offset, offset + limit);

  return { items, total, page: safePage, limit, totalPages };
}

module.exports = {
  SEARCH_FIELDS,
  STOCK_STATUS_SQL,
  buildProductSearchQuery,
  filterByExpiration,
  paginateRows,
  parseExpToSortKey,
};
