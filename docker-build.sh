#!/bin/bash

# Docker build and run script for HMWebApp

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Please create one based on .env.example"
    exit 1
fi

# Function to build and run development environment
dev() {
    print_status "Building and starting development environment..."
    docker-compose -f docker-compose.dev.yml up --build
}

# Function to build and run production environment
prod() {
    print_status "Building and starting production environment..."
    docker-compose up --build
}

# Function to stop development environment
dev_stop() {
    print_status "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
}

# Function to stop production environment
prod_stop() {
    print_status "Stopping production environment..."
    docker-compose down
}

# Function to view logs
logs() {
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml logs -f
    else
        docker-compose logs -f
    fi
}

# Function to clean up Docker resources
cleanup() {
    print_status "Cleaning up Docker resources..."
    docker system prune -f
    docker volume prune -f
}

# Function to show help
show_help() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  dev         Build and start development environment"
    echo "  prod        Build and start production environment"
    echo "  dev-stop    Stop development environment"
    echo "  prod-stop   Stop production environment"
    echo "  logs [dev]  View logs (dev for development logs)"
    echo "  cleanup     Clean up Docker resources"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev          # Start development environment"
    echo "  $0 prod         # Start production environment"
    echo "  $0 logs dev     # View development logs"
    echo "  $0 cleanup      # Clean up Docker resources"
}

# Main script logic
case "$1" in
    "dev")
        dev
        ;;
    "prod")
        prod
        ;;
    "dev-stop")
        dev_stop
        ;;
    "prod-stop")
        prod_stop
        ;;
    "logs")
        logs "$2"
        ;;
    "cleanup")
        cleanup
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac 