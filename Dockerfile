# Use Node.js 20 LTS as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Add non-root user
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nodejs -u 1001

# Copy application code (AFTER the user is created)
COPY . .

# Create logs dir with correct ownership
RUN mkdir -p /app/logs \
  && rm -f /app/logs/*.log \
  && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "--expose-gc", "--max-old-space-size=512", "main.js"]
