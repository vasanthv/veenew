FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies first so this layer stays cached across
# source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

# Same entrypoint as App Platform: `npm start` -> `node init.js`.
CMD ["npm", "start"]
