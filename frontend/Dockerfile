FROM node:18 AS builder

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install -g bun
RUN bun i
COPY . .
# para produção:
RUN bun run build

# Production stage
FROM node:18

WORKDIR /usr/src/app

# Copy only necessary files from builder
COPY --from=builder /usr/src/app/.next/standalone ./
COPY --from=builder /usr/src/app/.next/static ./.next/static
COPY --from=builder /usr/src/app/public ./public

EXPOSE 3000
# para produção - usar standalone mode:
CMD ["node", "server.js"]
