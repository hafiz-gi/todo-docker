# frontend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src/ ./src/

EXPOSE 3000

CMD ["npx", "serve", "-s", "src", "-l", "3000"]
