# Multi-stage Dockerfile for CourtFlow Frontend
# Build stage
FROM node:alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy application source and build
COPY . .
RUN npm run build

# Production stage
FROM nginx:1.27-alpine AS runner
LABEL org.opencontainers.image.source="https://github.com/${GITHUB_REPOSITORY}"
LABEL maintainer="CourtFlow Dev Team"

# Remove default nginx static assets and copy build output
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Healthcheck for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
