FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
EXPOSE 5173
