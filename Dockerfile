FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV APP_MODE=local
ENV DATABASE_DRIVER=sqlite
ENV LOCAL_API_HOST=0.0.0.0
ENV LOCAL_API_PORT=8787
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8787
CMD ["node", "server/local-api.mjs"]
