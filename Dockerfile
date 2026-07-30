# syntax=docker/dockerfile:1
# bookworm (glibc) required — @byteink/mppjs ships a GraalVM native binary.

FROM maven:3.9-eclipse-temurin-21-jammy AS mpp-jar
WORKDIR /build
COPY server/java/pom.xml ./
COPY server/java/src ./src
RUN mvn -q package && test -f target/mpp-convert.jar

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run test:coverage
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Headless JRE for MPP import (skips AWT presentation data — fixes mppjs awt crash)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY --from=mpp-jar /build/target/mpp-convert.jar ./server/java/target/mpp-convert.jar
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "server/index.ts"]
