import { z } from "zod";

const optionalTrimmedString = z.preprocess((value) => {
  if (value == null) {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).max(255).optional());

export const authSessionSchema = z.object({
  initData: z.preprocess((value) => (value == null ? undefined : value), z.string().trim().optional()),
  startParam: optionalTrimmedString,
  referralCode: optionalTrimmedString,
});
