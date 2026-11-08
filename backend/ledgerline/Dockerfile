# =============================================================================
# Stage 1: Build Image
# =============================================================================
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /build

# Copy Maven wrapper and POM for layer caching
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw

# Download dependencies offline to optimize Docker cache
RUN ./mvnw dependency:go-offline -B

# Copy application source and build production artifact
COPY src/ src/
RUN ./mvnw clean package -DskipTests -B

# =============================================================================
# Stage 2: Minimal Non-Root Runtime Image
# =============================================================================
FROM eclipse-temurin:21-jre-alpine AS runtime

WORKDIR /app

# Install curl for container health check
RUN apk add --no-cache curl

# Create unprivileged application user and group (non-root)
RUN addgroup -S ledgerline && adduser -S ledgerline -G ledgerline

# Copy compiled jar from builder stage
COPY --from=builder /build/target/ledgerline-*.jar /app/app.jar

# Enforce strict file ownership
RUN chown -R ledgerline:ledgerline /app

# Switch to unprivileged non-root user
USER ledgerline

# Container Port
EXPOSE 8080

# Health check probing Spring Boot /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health || exit 1

# Launch application with /dev/./urandom entropy and container-aware memory allocation
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/./urandom", "-Dspring.profiles.active=prod", "-jar", "/app/app.jar"]

