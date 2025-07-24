# Docker Setup for HMWebApp

This project includes Docker configuration for both development and production environments.

## Prerequisites

- Docker
- Docker Compose
- Environment variables configured

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
MSSQL_USER=your_mssql_user
MSSQL_PASSWORD=your_mssql_password
MSSQL_SERVER=your_mssql_server
MSSQL_DATABASE=your_mssql_database

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_key_here

# ThingsBoard Configuration
THINGSBOARD_URL=https://your-thingsboard-instance.com
THINGSBOARD_USERNAME=your_thingsboard_username
THINGSBOARD_PASSWORD=your_thingsboard_password

# Email Configuration
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your_email@gmail.com
EMAIL_SERVER_PASSWORD=your_email_password
EMAIL_FROM=your_email@gmail.com

# Application Configuration
NODE_ENV=production
PORT=3000
```

## Development Environment

### Using Docker Compose (Recommended)

1. **Start development environment:**

   ```bash
   docker-compose -f docker-compose.dev.yml up --build
   ```

2. **Stop development environment:**

   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

3. **View logs:**
   ```bash
   docker-compose -f docker-compose.dev.yml logs -f
   ```

### Using Docker directly

1. **Build development image:**

   ```bash
   docker build -f Dockerfile.dev -t hmwebapp-dev .
   ```

2. **Run development container:**
   ```bash
   docker run -p 3000:3000 --env-file .env hmwebapp-dev
   ```

## Production Environment

### Using Docker Compose

1. **Start production environment:**

   ```bash
   docker-compose up --build
   ```

2. **Stop production environment:**

   ```bash
   docker-compose down
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

### Using Docker directly

1. **Build production image:**

   ```bash
   docker build -t hmwebapp .
   ```

2. **Run production container:**
   ```bash
   docker run -p 3000:3000 --env-file .env hmwebapp
   ```

## Docker Images

### Production Image (`Dockerfile`)

- Multi-stage build for optimized production image
- Uses Node.js 18 Alpine for smaller size
- Includes only production dependencies
- Runs as non-root user for security
- Optimized for Next.js standalone output

### Development Image (`Dockerfile.dev`)

- Single-stage build for development
- Includes all dependencies (including dev dependencies)
- Volume mounting for hot reloading
- Runs development server with file watching

## Features

### Production Features

- **Multi-stage build** for smaller image size
- **Security** with non-root user
- **Health checks** for container monitoring
- **Environment variable** support
- **Standalone output** for optimized deployment

### Development Features

- **Hot reloading** with volume mounting
- **Source code changes** reflected immediately
- **Development tools** included
- **Easy debugging** with direct access to logs

## Health Checks

The production container includes health checks that verify the application is running:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/hello"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## Networking

Both docker-compose files create isolated networks for the application:

- **Production**: `hmwebapp-network`
- **Development**: `hmwebapp-dev-network`

## Troubleshooting

### Common Issues

1. **Port already in use:**

   ```bash
   # Check what's using port 3000
   lsof -i :3000
   # Or change the port in docker-compose.yml
   ```

2. **Environment variables not loaded:**

   - Ensure `.env` file exists in project root
   - Check that all required variables are set

3. **Build fails:**

   ```bash
   # Clean Docker cache
   docker system prune -a
   # Rebuild without cache
   docker-compose build --no-cache
   ```

4. **Database connection issues:**
   - Verify database server is accessible
   - Check environment variables are correct
   - Ensure network connectivity

### Useful Commands

```bash
# View running containers
docker ps

# View container logs
docker logs <container_id>

# Access container shell
docker exec -it <container_id> sh

# Clean up unused resources
docker system prune

# View Docker disk usage
docker system df
```

## Deployment

### Local Deployment

```bash
# Production
docker-compose up -d

# Development
docker-compose -f docker-compose.dev.yml up -d
```

### Cloud Deployment

The Docker setup is compatible with:

- Azure Container Instances
- AWS ECS/Fargate
- Google Cloud Run
- Kubernetes
- Any Docker-compatible platform

## Security Notes

- Production image runs as non-root user
- Environment variables should be properly secured
- Database credentials should be managed securely
- Consider using Docker secrets for sensitive data
- Regularly update base images for security patches
