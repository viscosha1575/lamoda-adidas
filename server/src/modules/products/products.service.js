import { HttpError } from "../../lib/http-error.js";
import { createProductSchema, productIdSchema } from "./products.schema.js";

export function createProductsService({ productsRepository }) {
  return {
    async getAllProducts() {
      return productsRepository.findAll();
    },

    async getProductById(rawId) {
      const { id } = productIdSchema.parse({ id: rawId });
      const product = await productsRepository.findById(id);

      if (!product) {
        throw new HttpError(404, "Product not found");
      }

      return product;
    },

    async createProduct(payload) {
      const product = createProductSchema.parse(payload);
      return productsRepository.create(product);
    },
  };
}
