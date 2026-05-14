FROM node:20-alpine AS builder

WORKDIR /app

ARG REQUEST_BODY_SECRET

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN REQUEST_BODY_SECRET="$REQUEST_BODY_SECRET" npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
