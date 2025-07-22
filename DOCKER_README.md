# Docker Setup for AutoScout Scraper

This guide explains how to run the AutoScout scraper using Docker.

## Prerequisites

- Docker installed on your system
- Docker Compose installed on your system

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# AWS Configuration (if using AWS services)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1

# Application Configuration
NODE_ENV=production
USER_PROCESSING_CONCURRENCY=5
```

## Running with Docker Compose (Recommended)

1. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f
   ```

3. **Stop the container:**
   ```bash
   docker-compose down
   ```

4. **Rebuild and restart:**
   ```bash
   docker-compose up -d --build
   ```

## Running with Docker directly

1. **Build the image:**
   ```bash
   docker build -t autoscout-scraper .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name autoscout-scraper \
     --restart unless-stopped \
     --env-file .env \
     autoscout-scraper
   ```

3. **View logs:**
   ```bash
   docker logs -f autoscout-scraper
   ```

4. **Stop the container:**
   ```bash
   docker stop autoscout-scraper
   docker rm autoscout-scraper
   ```

## Container Features

- **Automatic restart**: Container will restart automatically if it crashes
- **Health checks**: Built-in health monitoring
- **Logging**: All logs are available via `docker logs`
- **Environment variables**: Supports `.env` file for configuration
- **Security**: Runs as non-root user

## Scheduling

The application runs the scraper every hour automatically. The container will:

1. Start immediately and run the scraper once
2. Continue running in the background
3. Execute the scraper every hour at the top of the hour
4. Log all activities

## Monitoring

- Check container status: `docker ps`
- View real-time logs: `docker logs -f autoscout-scraper`
- Check health status: `docker inspect autoscout-scraper`

## Troubleshooting

1. **Container won't start**: Check your `.env` file and ensure all required variables are set
2. **Database connection issues**: Verify your `DATABASE_URL` is correct and accessible
3. **Permission issues**: The container runs as a non-root user for security
4. **Logs not showing**: Use `docker logs -f autoscout-scraper` to see real-time logs 