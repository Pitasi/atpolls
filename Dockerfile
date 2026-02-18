FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json .
RUN npm install --frozen-lockfile
COPY . .
RUN npm run build

CMD ["node", "./dist/index.js"]
