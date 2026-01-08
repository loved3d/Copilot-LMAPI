FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Compile TypeScript
RUN npm run compile

# Package the extension
RUN npm run package

# Default command
CMD ["echo", "Build and packaging complete"]