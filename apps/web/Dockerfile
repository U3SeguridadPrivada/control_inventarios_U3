# Stage 1: build
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

# Stage 2: serve static files
FROM node:20-alpine
RUN npm install -g serve
COPY --from=builder /app/dist /app/dist
WORKDIR /app
CMD ["sh", "-c", "serve -s dist -l $PORT"]
