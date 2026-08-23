/**
 * Modular filter definitions for product search.
 * Add new filters here to extend the search UI and API params.
 */

export const STOCK_STATUS_OPTIONS = [
  { value: '', label: 'All stock' },
  { value: 'in_stock', label: 'In stock (20+)' },
  { value: 'low_stock', label: 'Low stock (1–19)' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

export const DEFAULT_PRODUCT_FILTERS = {
  category: '',
  brand: '',
  minPrice: '',
  maxPrice: '',
  stockStatus: '',
  expBefore: '',
};

export const PRODUCT_SEARCH_PAGE_SIZE = 24;

/** Expiration month options for filter (MON YYYY). */
export function buildExpirationOptions() {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const options = [{ value: '', label: 'Any expiration' }];
  const now = new Date();
  const startYear = now.getFullYear();
  const startMonth = now.getMonth();

  for (let i = 0; i < 36; i += 1) {
    const monthIndex = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);
    const value = `${months[monthIndex]} ${year}`;
    options.push({ value, label: `Expires by ${value}` });
  }

  return options;
}

/**
 * Decide whether the request is search-only or filter-driven.
 * - Non-empty query: match search text only (filters ignored).
 * - Empty query: apply selected filters, defaulting to in-stock when none are set.
 */
export function resolveProductSearchRequest({ q = '', filters = {} }) {
  const trimmedQuery = q.trim();

  if (trimmedQuery) {
    return { q: trimmedQuery, filters: {} };
  }

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== undefined && value !== null && String(value).trim() !== ''
  );

  return {
    q: '',
    filters: hasActiveFilters ? filters : { ...filters, stockStatus: 'in_stock' },
  };
}

/**
 * Serialize filters + query into API query params.
 * Only non-empty values are sent.
 */
export function buildSearchQueryParams({ q = '', filters = {}, page = 1, limit = PRODUCT_SEARCH_PAGE_SIZE }) {
  const params = { page: String(page), limit: String(limit) };

  if (q.trim()) params.q = q.trim();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params[key] = String(value).trim();
    }
  });

  return params;
}

export function getStockStatus(stock) {
  if (stock <= 0) return { label: 'Out of stock', tone: 'danger' };
  if (stock < 20) return { label: 'Low stock', tone: 'warning' };
  return { label: 'In stock', tone: 'good' };
}

export function formatPrice(value) {
  return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
