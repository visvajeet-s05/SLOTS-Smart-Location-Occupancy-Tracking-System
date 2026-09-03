# SLOTS Realtime Service Dockerfile
# Node.js + Socket.IO + WebTransport + Redis

FROM node:18-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    REDIS_HOST=redis \
    REDIS_PORT=6379

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Expose service port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["npm", "start"]
