FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY . .

ENV MCP_TRANSPORT=http
ENV MCP_HOST=0.0.0.0
ENV MCP_RATE_LIMIT_PER_MINUTE=60

EXPOSE 3000

CMD ["node", "src/index.js"]

