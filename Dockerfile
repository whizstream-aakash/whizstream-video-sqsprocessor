# Use Node.js as the base image
FROM node:18.0.0-alpine3.15

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source files
COPY . .

# Compile TypeScript files
RUN npm run build

# Start the application
CMD ["node", "dist/index.js"]
