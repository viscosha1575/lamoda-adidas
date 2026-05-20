export function createCorsMiddleware({ allowedOrigins }) {
  const allowAll = allowedOrigins.includes("*");
  const allowedHeaders = [
    "Authorization",
    "Content-Type",
    "X-Telegram-Init-Data",
  ].join(", ");

  return function corsMiddleware(request, response, next) {
    const requestOrigin = request.headers.origin;

    if (allowAll && requestOrigin) {
      response.header("Access-Control-Allow-Origin", requestOrigin);
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      response.header("Access-Control-Allow-Origin", requestOrigin);
    }

    response.header("Vary", "Origin");
    response.header("Access-Control-Allow-Headers", allowedHeaders);
    response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  };
}
