# Use an official Node.js runtime as a parent image
FROM alpine:3.23
ENV CONFIG_PATH='/data/config'
# Set the working directory in the container
WORKDIR /app


COPY librechat.yaml /app/librechat.yaml
COPY copy_config_file.sh /app/copy_config_file.sh

RUN chmod +x /app/copy_config_file.sh

# Define the command to run the application
CMD ["/app/copy_config_file.sh"]
