export function createProductsController({ productsService }) {
  return {
    async getAll(request, response) {
      const products = await productsService.getAllProducts();
      response.json({ data: products });
    },

    async getById(request, response) {
      const product = await productsService.getProductById(request.params.id);
      response.json({ data: product });
    },

    async create(request, response) {
      const product = await productsService.createProduct(request.body);
      response.status(201).json({ data: product });
    },
  };
}
