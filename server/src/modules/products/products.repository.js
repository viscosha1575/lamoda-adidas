export function createProductsRepository({ pool }) {
  const mapProduct = (row) => ({
    id: Number(row.id),
    name: row.name,
    brand: row.brand,
    price: Number(row.price),
    currency: row.currency,
    stock: Number(row.stock),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });

  return {
    async findAll() {
      const result = await pool.query(
        `SELECT id, name, brand, price, currency, stock, created_at, updated_at
         FROM products
         ORDER BY id ASC`,
      );

      return result.rows.map(mapProduct);
    },

    async findById(id) {
      const result = await pool.query(
        `SELECT id, name, brand, price, currency, stock, created_at, updated_at
         FROM products
         WHERE id = $1`,
        [id],
      );

      return result.rows[0] ? mapProduct(result.rows[0]) : null;
    },

    async create(product) {
      const result = await pool.query(
        `INSERT INTO products (name, brand, price, currency, stock)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, brand, price, currency, stock, created_at, updated_at`,
        [product.name, product.brand, product.price, product.currency, product.stock],
      );

      return mapProduct(result.rows[0]);
    },
  };
}
