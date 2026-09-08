FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg yt-dlp zip

# Install Python dependencies
RUN pip3 install youtube-transcript-api

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --production

# Copy app files
COPY . .

# Create temp directory
RUN mkdir -p .tmp

EXPOSE 3000

CMD ["node", "server.js"]
