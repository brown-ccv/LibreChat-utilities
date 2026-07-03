FROM python:3.11-slim

WORKDIR /app

# Copy historial metrics script
COPY monthly_spend_report.py .

# Install dependencies
RUN pip install mysql-connector-python psycopg2-binary

# Run the script
CMD ["python", "monthly_spend_report.py"]