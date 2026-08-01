// In Electron, preload.js exposes window.pospilot.apiBaseUrl.
// When running the client alone in a browser (e.g. `npm run dev` in /client
// against `npm run dev` in /server), fall back to the default server port.
const BASE_URL =
  (typeof window !== 'undefined' && window.pospilot && window.pospilot.apiBaseUrl) ||
  'http://localhost:4000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export const api = {
  getProducts: (q = '') => request(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getProduct: (id) => request(`/products/${id}`),
  getProductByBarcode: (barcode) => request(`/products/barcode/${encodeURIComponent(barcode)}`),
  createSale: (payload) =>
    request('/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
