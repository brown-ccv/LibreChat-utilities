FROM python:3.11-slim

RUN apt-get update \
	&& apt-get upgrade -y --no-install-recommends \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy historial metrics script
COPY budget_manager.py .
COPY database_manager.py .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run the script
CMD ["python", "budget_manager.py"]