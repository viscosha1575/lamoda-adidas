import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  brand: z.string().trim().min(2).max(60),
  price: z.coerce.number().nonnegative(),
  currency: z.string().trim().length(3).default("RUB"),
  stock: z.coerce.number().int().nonnegative().default(0),
});

export const productIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
