# DriveSense dashboard image: Vite build served by nginx.
# nginx also reverse-proxies /api and /health to the backend (BACKEND_URL),
# so the browser only talks to one origin.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# The official nginx image renders /etc/nginx/templates/*.template with envsubst at start-up.
ENV BACKEND_URL=http://backend:8000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
