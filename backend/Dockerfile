FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
RUN npm install --include=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY backend ./backend
WORKDIR /app/backend
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/drizzle ./backend/drizzle
COPY --from=build /app/backend/package.json ./backend/package.json
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
