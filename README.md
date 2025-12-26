Libbrechat Utilities
# LibreChat Utilities

A collection of utility Docker images for managing LibreChat deployments at Brown University.

## Overview

This repository contains two utility services:
- **librechat-config-file**: Manages and deploys LibreChat configuration files
- **librechat-clean-logs**: Automated log cleanup service

## Services

### 1. LibreChat Config File

A lightweight Alpine-based Docker image that copies the LibreChat configuration file to a specified location.

#### Features
- Simple configuration deployment
- Environment-based configuration path
- Minimal footprint (Alpine-based)

#### Environment Variables
- `CONFIG_PATH`: Target directory for the configuration file (default: `/data/config`)

#### Usage

**Docker Run:**
```bash
docker run -v /path/to/config:/data/config \
  -e CONFIG_PATH=/data/config \
  ghcr.io/brown-ccv/librechat-config-file:latest
```

**Docker Compose:**
```yaml
services:
  config-copier:
    image: ghcr.io/brown-ccv/librechat-config-file:latest
    environment:
      CONFIG_PATH: /data/config
    volumes:
      - ./config:/data/config
```

#### Updating Configuration

1. Clone this repository
2. Modify `librechat-config-file/librechat.yaml`
3. Commit and push changes
4. Trigger the GitHub Action manually or push to main branch
5. Deploy the new image

#### Configuration Generation (Local Development)

For generating custom configurations locally:

```bash
cd librechat-config-file
pip install -r requirements.txt
python prepare_config_file.py
```

This reads `template_librechat.yaml` and `prompt.md`, then generates `librechat.yaml`.

---

### 2. LibreChat Clean Logs

A scheduled service that automatically cleans old log files from LibreChat directories.

#### Features
- Configurable retention period
- Configurable log directory
- Lightweight Alpine-based image

#### Environment Variables
- `LOG_DIR_TO_CLEAN`: Directory containing logs to clean (default: `/data/logs`)
- `DAYS_TO_CLEAN`: Number of days to retain logs (default: `180`)

#### Usage

**Docker Run:**
```bash
docker run -v /path/to/logs:/data/logs \
  -e LOG_DIR_TO_CLEAN=/data/logs \
  -e DAYS_TO_CLEAN=180 \
  ghcr.io/brown-ccv/librechat-clean-logs:latest
```

**Docker Compose:**
```yaml
services:
  log-cleaner:
    image: ghcr.io/brown-ccv/librechat-clean-logs:latest
    environment:
      LOG_DIR_TO_CLEAN: /data/logs
      DAYS_TO_CLEAN: 180
    volumes:
      - ./logs:/data/logs
```

---

## Building Images

### Prerequisites
- Docker
- GitHub account with package write permissions

### Local Build

**Config File Service:**
```bash
cd librechat-config-file
docker build -t librechat-config-file:local .
```

**Clean Logs Service:**
```bash
cd librechat-clean-logs
docker build -t librechat-clean-logs:local .
```

### GitHub Actions

Both services have automated builds via GitHub Actions:

1. Go to the "Actions" tab in the repository
2. Select the desired workflow:
   - "Build and Push Container" (for config file)
   - "Build and Push Container" (for clean logs)
3. Click "Run workflow"

Images are automatically pushed to GitHub Container Registry (ghcr.io).

---

## Project Structure

```
LibreChat-utilities/
├── librechat-config-file/
│   ├── Dockerfile
│   ├── librechat.yaml              # Main configuration file
│   ├── template_librechat.yaml     # Template for generation
│   ├── prompt.md                   # Prompt content for config
│   ├── copy_config_file.sh         # Deployment script
│   ├── prepare_config_file.py      # Config generator (dev only)
│   └── requirements.txt            # Python dependencies (dev only)
├── librechat-clean-logs/
│   ├── Dockerfile
│   └── clean_logs_script.sh        # Log cleanup script
├── .github/
│   └── workflows/
│       ├── docker-build-librechat-config.yaml
│       └── docker-build-librechat-clean-logs.yaml
└── README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

---

## License

[Add your license here]

---

## Maintainers

Office of Information Technology  
Brown University

---

## Related Documentation

- [LibreChat Documentation](https://www.librechat.ai/docs)
- [LibreChat Configuration Guide](https://www.librechat.ai/docs/configuration/librechat_yaml)
- [Brown CCV AI Tools](https://docs.ccv.brown.edu/ai-tools/)
