# One image, two roles: API (default) or worker (override the command).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY public ./public
COPY package.json ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://localhost:4000/health/live || exit 1
CMD ["node", "dist/index.js"]
