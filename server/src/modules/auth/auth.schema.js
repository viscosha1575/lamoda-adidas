import { z } from "zod";

export const authSessionSchema = z.object({
  initData: z.string().trim().optional(),
  anonymousId: z.string().trim().min(8).max(128).optional(),
  referralCode: z.string().trim().min(1).max(255).optional(),
  profile: z
    .object({
      id: z.union([z.number().int().positive(), z.string().trim().min(1)]).optional(),
      username: z.string().trim().max(64).optional(),
      first_name: z.string().trim().max(120).optional(),
      last_name: z.string().trim().max(120).optional(),
    })
    .optional(),
});
