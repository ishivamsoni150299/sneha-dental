FROM node:22-bookworm-slim AS frontend
WORKDIR /workspace
COPY package*.json ./
RUN npm ci
COPY angular.json postcss.config.cjs tailwind.config.cjs tsconfig*.json ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM maven:3.9.11-eclipse-temurin-25 AS backend
WORKDIR /workspace/backend
COPY backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY backend/src ./src
COPY --from=frontend /workspace/dist/mydentalplatform/browser ./src/main/resources/static
RUN mvn -B -DskipTests package

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 10001 spring
COPY --from=backend /workspace/backend/target/platform-api-0.1.0-SNAPSHOT.jar app.jar
USER spring
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]