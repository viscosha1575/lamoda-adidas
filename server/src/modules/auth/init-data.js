import { HttpError } from "../../lib/http-error.js";

function hasOwnInitData(container) {
  if (!container || typeof container !== "object") {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(container, "initData");
}

export function getTelegramInitDataFromHeadersOnly(request) {
  const headerInitData = request.headers["x-telegram-init-data"]
    ?? request.headers["x-init-data"]
    ?? null;

  if (hasOwnInitData(request.body) || hasOwnInitData(request.query)) {
    throw new HttpError(400, "Telegram initData must be sent only in headers");
  }

  return headerInitData ? String(headerInitData) : null;
}
