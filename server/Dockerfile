# server/Dockerfile
FROM node:18-alpine AS deps
WORKDIR /app

# 1) Копируем только манифесты, чтобы кеш не инвалидировать
COPY package.json package-lock.json* ./

# 2) Универсальная установка:
# - если есть package-lock.json -> используем `npm ci`
# - иначе fallback на `npm install`
# - затем удаляем dev-зависимости самым совместимым способом
RUN set -eux; \
    if [ -f package-lock.json ]; then \
    npm ci || (echo "npm ci failed, trying npm install" && npm install); \
    else \
    npm install; \
    fi; \
    # prune dev-зависимостей под любой npm
    (npm prune --production 2>/dev/null || true); \
    # Для npm 10+ — аналог
    (npm prune --omit=dev 2>/dev/null || true)

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# node_modules из слоя deps
COPY --from=deps /app/node_modules ./node_modules

# остальной код
COPY . .

EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "start"]
