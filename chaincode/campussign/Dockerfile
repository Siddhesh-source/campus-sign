# Chaincode-as-a-Service image for the Fabric test network.
FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /usr/src/app
COPY --from=build /usr/src/app /usr/src/app
ENV PORT=9999
EXPOSE 9999
USER node
CMD ["sh", "-c", "npx fabric-chaincode-node server --chaincode-address=$CHAINCODE_SERVER_ADDRESS --chaincode-id=$CHAINCODE_ID"]
