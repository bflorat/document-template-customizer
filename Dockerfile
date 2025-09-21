# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build the app
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime

# Copy built assets
COPY --from=build /app/dist/ /usr/share/nginx/html/

# Nginx config (SPA fallback to index.html)
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Optional: basic healthcheck
HEALTHCHECK CMD wget -q -O /dev/null http://localhost/ || exit 1

# nginx image provides the default CMD

