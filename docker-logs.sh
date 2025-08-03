#!/bin/bash

# Docker Logs Helper Script
# Usage: ./docker-logs.sh [server] [username] [password]

set -e

# Default values
SERVER=${1:-"webapp02.heatmanager.cloud"}
USERNAME=${2:-"root"}
PASSWORD=${3:-"Ch!l!net$$01"}

echo "🐳 Docker Logs Helper"
echo "Server: $SERVER"
echo "Username: $USERNAME"
echo ""

# Function to show log locations
show_log_locations() {
    echo "📋 Docker Log Locations:"
    echo ""
    echo "1. Container Logs:"
    echo "   docker-compose -f docker-compose.simple.yml logs"
    echo "   docker-compose -f docker-compose.simple.yml logs -f"
    echo "   docker-compose -f docker-compose.simple.yml logs hmwebapp"
    echo ""
    echo "2. Docker System Logs:"
    echo "   journalctl -u docker.service"
    echo "   journalctl -u docker.service -f"
    echo ""
    echo "3. Application Logs (inside container):"
    echo "   docker exec -it hmwebapp_hmwebapp_1 cat /app/.next/server.log"
    echo "   docker exec -it hmwebapp_hmwebapp_1 tail -f /app/.next/server.log"
    echo ""
    echo "4. System Logs:"
    echo "   /var/log/docker.log"
    echo "   /var/log/syslog | grep docker"
    echo ""
}

# Function to connect and show logs
connect_and_show_logs() {
    echo "🔗 Connecting to server..."
    
    # Create SSH command with password
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "🐳 Docker Status:"
        docker ps -a
        echo ""
        
        echo "📋 Container Logs (last 50 lines):"
        if [ -f "docker-compose.simple.yml" ]; then
            docker-compose -f docker-compose.simple.yml logs --tail=50
        else
            echo "docker-compose.simple.yml not found in current directory"
        fi
        echo ""
        
        echo "📊 Docker System Info:"
        docker system df
        echo ""
        
        echo "🔍 Recent Docker Events:"
        docker events --since 1h --until now
        echo ""
        
        echo "📁 Log File Locations:"
        echo "Container logs: docker-compose -f docker-compose.simple.yml logs"
        echo "Follow logs: docker-compose -f docker-compose.simple.yml logs -f"
        echo "Specific container: docker-compose -f docker-compose.simple.yml logs hmwebapp"
        echo "System logs: journalctl -u docker.service"
        echo "Application logs: docker exec -it \$(docker ps -q --filter name=hmwebapp) tail -f /app/.next/server.log"
EOF
}

# Function to show real-time logs
show_realtime_logs() {
    echo "📺 Starting real-time log monitoring..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" "docker-compose -f docker-compose.simple.yml logs -f"
}

# Function to show specific container logs
show_container_logs() {
    local container_name=${1:-"hmwebapp"}
    echo "📋 Showing logs for container: $container_name"
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" "docker-compose -f docker-compose.simple.yml logs $container_name"
}

# Function to show system logs
show_system_logs() {
    echo "🔧 Showing Docker system logs..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" "journalctl -u docker.service --since '1 hour ago'"
}

# Function to show application logs
show_app_logs() {
    echo "📱 Showing application logs..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        CONTAINER_ID=$(docker ps -q --filter name=hmwebapp)
        if [ ! -z "$CONTAINER_ID" ]; then
            echo "Container ID: $CONTAINER_ID"
            docker exec -it $CONTAINER_ID tail -f /app/.next/server.log
        else
            echo "No hmwebapp container found"
            docker ps -a
        fi
EOF
}

# Main menu
show_menu() {
    echo "🐳 Docker Logs Helper Menu:"
    echo ""
    echo "1. Show log locations and commands"
    echo "2. Connect and show current logs"
    echo "3. Show real-time logs (follow)"
    echo "4. Show specific container logs"
    echo "5. Show Docker system logs"
    echo "6. Show application logs"
    echo "7. Show all logs (comprehensive)"
    echo "0. Exit"
    echo ""
    read -p "Choose option (0-7): " choice
    
    case $choice in
        1) show_log_locations ;;
        2) connect_and_show_logs ;;
        3) show_realtime_logs ;;
        4) read -p "Enter container name (default: hmwebapp): " container; show_container_logs "$container" ;;
        5) show_system_logs ;;
        6) show_app_logs ;;
        7) 
            echo "📊 Comprehensive Log Report:"
            connect_and_show_logs
            echo ""
            echo "🔧 System Logs:"
            show_system_logs
            ;;
        0) echo "👋 Goodbye!"; exit 0 ;;
        *) echo "❌ Invalid option"; show_menu ;;
    esac
}

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo "❌ sshpass not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install sshpass
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get update && sudo apt-get install -y sshpass
    else
        echo "❌ Please install sshpass manually"
        exit 1
    fi
fi

# Show menu if no arguments provided
if [ $# -eq 0 ]; then
    show_menu
else
    # Direct execution with arguments
    connect_and_show_logs
fi 