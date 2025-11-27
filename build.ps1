# Build script for autoscout-scraper-CarClick Docker image

# Set variables
$IMAGE_NAME = "bbentoker/autoscout-scraper-carclick"
$TAG = "latest"

Write-Host "Building Docker image: $IMAGE_NAME`:$TAG" -ForegroundColor Green

# Build the Docker image
try {
    docker build -t "$IMAGE_NAME`:$TAG" .
    if ($LASTEXITCODE -ne 0) {
        throw "Docker build failed"
    }
    Write-Host "Docker image built successfully" -ForegroundColor Green
} catch {
    Write-Host "Error building Docker image: $_" -ForegroundColor Red
    exit 1
}

# Push the Docker image
Write-Host "Pushing Docker image to registry..." -ForegroundColor Green
try {
    docker push "$IMAGE_NAME`:$TAG"
    if ($LASTEXITCODE -ne 0) {
        throw "Docker push failed"
    }
    Write-Host "Docker image pushed successfully" -ForegroundColor Green
} catch {
    Write-Host "Error pushing Docker image: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Build and push process completed successfully!" -ForegroundColor Green 