FROM python:3.11-slim

WORKDIR /app

# Copy historial metrics script
COPY export_metrics.py .

# Install dependencies
RUN pip install mysql-connector-python pymongo

# Run the script
CMD ["python", "export_metrics.py"]