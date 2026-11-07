FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable \
  && corepack prepare pnpm@9.15.3 --activate

COPY . .
RUN pnpm install --frozen-lockfile --filter client...
WORKDIR /app/apps/client
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
