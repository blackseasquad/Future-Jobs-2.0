FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY vite.config.js ./
COPY web ./web
COPY src/shared ./src/shared
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production DATABASE_PATH=/data/future-jobs.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
