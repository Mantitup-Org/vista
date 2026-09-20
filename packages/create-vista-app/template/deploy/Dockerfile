# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.vista ./.vista
EXPOSE 3003
CMD ["node", ".vista/standalone/server.js"]
