import crypto from "node:crypto";

function createSecretKey(botToken) {
  return crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
}

function parseInitData(initData) {
  const searchParams = new URLSearchParams(initData);
  const data = {};

  for (const [key, value] of searchParams.entries()) {
    data[key] = value;
  }

  return data;
}

function buildDataCheckString(data) {
  return Object.entries(data)
    .filter(([key]) => key !== "hash")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function extractTelegramUserFromInitData(initData) {
  const parsed = parseInitData(initData);

  if (!parsed.user) {
    return null;
  }

  try {
    return JSON.parse(parsed.user);
  } catch {
    return null;
  }
}

export function validateTelegramInitData(initData, botToken) {
  const parsed = parseInitData(initData);
  const expectedHash = parsed.hash;

  if (!expectedHash) {
    return false;
  }

  const dataCheckString = buildDataCheckString(parsed);
  const secretKey = createSecretKey(botToken);
  const actualHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const actualHashBuffer = Buffer.from(actualHash);
  const expectedHashBuffer = Buffer.from(expectedHash);

  if (actualHashBuffer.length !== expectedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualHashBuffer, expectedHashBuffer);
}
