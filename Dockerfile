# Multi-stage Dockerfile for Conduit
# Optimized for production deployment with security best practices

# ============================================
# Stage 1: Builder
# ============================================
FROM node:25-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ============================================
# Stage 2: Production
# ============================================
FROM node:25-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set NODE_ENV to production
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 conduit && \
    adduser -D -u 1001 -G conduit conduit

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R conduit:conduit /app

# Switch to non-root user
USER conduit

# Expose port (default: 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
