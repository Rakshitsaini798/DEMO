// A pretend database. Every query waits `delayMs` to feel like a real one.

const products = new Map([
  [1, { id: 1, name: "Mechanical Keyboard", price: 4999, stock: 12 }],
  [2, { id: 2, name: "Wireless Mouse", price: 1499, stock: 40 }],
  [3, { id: 3, name: "27\" Monitor", price: 18999, stock: 5 }],
  [4, { id: 4, name: "USB-C Hub", price: 2499, stock: 0 }],
  [5, { id: 5, name: "Laptop Stand", price: 1999, stock: 23 }],
]);

export function createDb({ delayMs = 500 } = {}) {
  let queries = 0;
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));

  return {
    /** How many "real" queries have hit the database. */
    get queryCount() {
      return queries;
    },

    async findProduct(id) {
      queries++;
      await wait();
      const product = products.get(id);
      return product ? { ...product } : null;
    },

    async listProducts() {
      queries++;
      await wait();
      return [...products.values()].map((p) => ({ ...p }));
    },

    async updateStock(id, stock) {
      queries++;
      await wait();
      const product = products.get(id);
      if (!product) return null;
      product.stock = stock;
      return { ...product };
    },
  };
}
