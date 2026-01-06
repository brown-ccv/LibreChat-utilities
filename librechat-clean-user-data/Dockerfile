FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY .env* ./

# Run the script
CMD ["npm", "run", "delete-user-data-by-date"]