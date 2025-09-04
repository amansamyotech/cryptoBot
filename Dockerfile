# Base image
FROM node:18-alpine
 
# Set working directory
WORKDIR /app
 
# Copy package files & install dependencies
COPY package*.json ./
RUN npm install
 
# Copy source code
COPY . .
 
# Set working directory to bot
WORKDIR /app/bot
 
# Run the bot
CMD ["node", "index.js"]