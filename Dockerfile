# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Create logs directory for PM2
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"] 