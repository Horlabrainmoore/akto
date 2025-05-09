# Use a specific version tag for the openjdk base image
FROM openjdk:11-jre-slim as build

WORKDIR /app

# Copy the JAR file into the build stage
COPY ./target/source-code-analyser-1.0-SNAPSHOT-jar-with-dependencies.jar /app/source-code-analyser-1.0-SNAPSHOT-jar-with-dependencies.jar

# Create a runtime stage to reduce the final image size
FROM openjdk:11-jre-slim

WORKDIR /app

# Copy the JAR file from the build stage
COPY --from=build /app/source-code-analyser-1.0-SNAPSHOT-jar-with-dependencies.jar /app/source-code-analyser-1.0-SNAPSHOT-jar-with-dependencies.jar

# Copy the start.sh script into the container
COPY start.sh /app/start.sh

# Add health checks to ensure the container is running correctly
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:8080/health || exit 1

# Specify the command to run the start.sh script
CMD ["/app/start.sh"]
