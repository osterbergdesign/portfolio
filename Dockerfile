# syntax=docker/dockerfile:1

# ---- 1. Build the static site with Astro ----
FROM node:22-slim AS build
WORKDIR /app

# Install dependencies first so Docker can cache this layer between content edits.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# Public address of the site, used for canonical links and link previews.
ARG SITE_URL=https://www.osterbergdesign.site
ENV SITE_URL=${SITE_URL}
RUN npm run build

# ---- 2. Serve the built files with nginx ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
