export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      message: `Route ${request.method} ${request.originalUrl} not found`,
      details: null,
    },
  });
}
