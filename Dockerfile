# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps using the lockfile only when it changes
COPY package.json package-lock.json ./
RUN npm ci

# Build the SPA
COPY . .
RUN npm run build

# ── Runtime stage ──
# Plain nginx serving the SPA build + reverse-proxying /api to the
# backend App Service. BACKEND_URL is injected at container start
# via envsubst into nginx.conf so the same image can target any env.
FROM nginx:1.27-alpine

# Static files
COPY --from=builder /app/dist /usr/share/nginx/html

# Conf template — `envsubst '${BACKEND_URL}'` runs in entrypoint.sh.
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/entrypoint.sh /docker-entrypoint.d/40-zhuji-proxy.sh
RUN chmod +x /docker-entrypoint.d/40-zhuji-proxy.sh

# Default to local dev so the image still runs `docker run -p 8080:8080 ...`
# unconfigured — production overrides via App Service app settings.
ENV BACKEND_URL=http://backend:8000
ENV PORT=8080

EXPOSE 8080
