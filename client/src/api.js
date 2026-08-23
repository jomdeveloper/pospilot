/**
 * Client API layer for product search.
 */
const BASE_URL =
  (typeof window !== 'undefined' && window.pospilot && window.pospilot.apiBaseUrl) ||
  'http://localhost:4000/api';

async function request(path, options = {}) {
  const { authToken, ...requestOptions } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(requestOptions.headers || {}),
    },
    ...requestOptions,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

function toQueryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  login: (payload) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProducts: (q = '') => request(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  searchProducts: (params = {}) => request(`/products${toQueryString(params)}`),

  getProductFilterMeta: () => request('/products/filters'),

  getProduct: (id) => request(`/products/${id}`),

  getProductMetadata: () => request('/products/metadata'),

  createProduct: (payload) =>
    request('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProduct: (id, payload, authToken) =>
    request(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      authToken,
    }),

  deleteProduct: (id, authToken) =>
    request(`/products/${id}`, {
      method: 'DELETE',
      authToken,
    }),

  getProductByBarcode: (barcode) => request(`/products/barcode/${encodeURIComponent(barcode)}`),

  createSale: (payload) =>
    request('/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSales: () => request('/sales'),

  getUsers: (q = '') => request(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createUser: (payload, authToken) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
      authToken,
    }),

  updateUserStatus: (id, status) =>
    request(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getPurchases: () => request('/procurement/purchases'),

  getPurchase: (id) => request(`/procurement/purchases/${id}`),

  createPurchase: (payload) =>
    request('/procurement/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  cancelPurchase: (id) => request(`/procurement/purchases/${id}/cancel`, { method: 'PATCH' }),

  getReceiving: () => request('/procurement/receiving'),

  receivePurchase: (id, payload) =>
    request(`/procurement/receiving/${id}/receive`, { method: 'POST', body: JSON.stringify(payload) }),

  getCategories: () => request('/categories'),

  createCategory: (payload, authToken) =>
    request('/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
      authToken,
    }),

  updateCategory: (categoryName, payload, authToken) =>
    request(`/categories/${encodeURIComponent(categoryName)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      authToken,
    }),

  deleteCategory: (categoryName, authToken) =>
    request(`/categories/${encodeURIComponent(categoryName)}`, {
      method: 'DELETE',
      authToken,
    }),

  getSuppliers: (q = '') => request(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createSupplier: (payload, authToken) =>
    request('/suppliers', {
      method: 'POST',
      body: JSON.stringify(payload),
      authToken,
    }),

  updateSupplier: (id, payload, authToken) =>
    request(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload), authToken }),

  deleteSupplier: (id, authToken) =>
    request(`/suppliers/${id}`, { method: 'DELETE', authToken }),

  getCustomers: (q = '') => request(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  getAuditLogs: (authToken) => request('/audit-logs', { authToken }),

  createCustomer: (payload) =>
    request('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
