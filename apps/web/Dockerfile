# Build context is the repository root (workspaces share one lockfile).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@todo/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace=@todo/web

FROM nginxinc/nginx-unprivileged:1.28-alpine
# Rendered to /etc/nginx/conf.d/default.conf at start-up, substituting API_UPSTREAM only.
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://api:4000
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
