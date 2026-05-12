import { z } from "zod";

export const authSessionSchema = z.object({
  initData: z.string().trim().optional(),
  referralCode: z.string().trim().min(1).max(255).optional(),
});
