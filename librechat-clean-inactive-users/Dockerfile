FROM node:20.19-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src


# Run the script
CMD ["npm", "run", "delete-user-data-by-date"]
