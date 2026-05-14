import crypto from "node:crypto";

import { HttpError } from "../../lib/http-error.js";

function decodeBase64Field(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `Invalid encrypted admin payload: ${fieldName} is required`);
  }

  return Buffer.from(value, "base64");
}

export function decryptAdminRequestBody(body, secret) {
  if (!body || typeof body !== "object") {
    return body ?? {};
  }

  if (!body.payload && !body.iv && !body.authTag) {
    return body;
  }

  if (!secret) {
    throw new HttpError(500, "REQUEST_BODY_SECRET is not configured on the server");
  }

  try {
    const payload = decodeBase64Field(body.payload, "payload");
    const iv = decodeBase64Field(body.iv, "iv");
    const authTag = decodeBase64Field(body.authTag, "authTag");
    const key = crypto.createHash("sha256").update(String(secret)).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(payload),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(decrypted || "{}");
  } catch (error) {
    throw new HttpError(400, "Invalid encrypted admin payload", {
      reason: error instanceof Error ? error.message : "unknown error",
    });
  }
}
