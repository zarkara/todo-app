# Build context is the repository root (workspaces share one lockfile).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace=@todo/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@todo/api

# The bundle has no runtime dependencies, so the final image is just Node and one file.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/apps/api/dist/server.cjs ./
USER node
EXPOSE 4000
CMD ["node", "server.cjs"]
