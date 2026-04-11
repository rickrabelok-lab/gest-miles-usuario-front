# Imagem de produção para o Express (API + webhook Stripe).
# Build (na pasta backend): docker build -t gest-miles-api .
# Run: docker run -p 3000:3000 --env-file .env gest-miles-api

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
