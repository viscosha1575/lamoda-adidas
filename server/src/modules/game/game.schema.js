import { z } from "zod";

export const sneakerCollectSchema = z.object({
  sneakerNumber: z.coerce.number().int().min(1).max(10),
});

export const startSessionSchema = z.object({});

export const activityLogSchema = z.object({
  source: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1).max(120),
  details: z.unknown().optional(),
});
