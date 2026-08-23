export async function createSale(payload) {
  return {
    id: `INV-${Math.floor(10000 + Math.random() * 90000)}`,
    ...payload,
  };
}
