# Use an official Node.js runtime as a parent image
FROM alpine:3.23
ENV LOG_DIR_TO_CLEAN='/data/logs'
ENV DAYS_TO_CLEAN=180

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json into the container
COPY clean_logs_script.sh /app/clean_logs_script.sh

RUN chmod +x /clean_script.sh

# Define the command to run the application
CMD ["/app/clean_logs_script.sh"]
