#!/bin/bash

# Authentication Debug Script
# Usage: ./debug-auth.sh [server] [username] [password]

set -e

# Default values
SERVER=${1:-"webapp02.heatmanager.cloud"}
USERNAME=${2:-"root"}
PASSWORD=${3:-"Ch!l!net$$01"}

echo "🔍 Authentication Debug Script"
echo "Server: $SERVER"
echo "Username: $USERNAME"
echo ""

# Function to check container status
check_container_status() {
    echo "🐳 Checking container status..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== Container Status ==="
        docker ps -a
        echo ""
        
        echo "=== Container Health ==="
        docker-compose -f docker-compose.simple.yml ps
        echo ""
        
        echo "=== Container Logs (last 20 lines) ==="
        docker-compose -f docker-compose.simple.yml logs --tail=20
        echo ""
EOF
}

# Function to check application health
check_app_health() {
    echo "🏥 Checking application health..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== Application Health Check ==="
        
        # Check if container is running
        CONTAINER_ID=$(docker ps -q --filter name=hmwebapp)
        if [ -z "$CONTAINER_ID" ]; then
            echo "❌ No hmwebapp container found!"
            docker ps -a
            exit 1
        fi
        
        echo "✅ Container ID: $CONTAINER_ID"
        
        # Check if port 3000 is listening
        echo "=== Port Check ==="
        netstat -tulpn | grep :3000 || echo "❌ Port 3000 not listening"
        echo ""
        
        # Check application logs
        echo "=== Application Logs ==="
        docker exec -it $CONTAINER_ID tail -f /app/.next/server.log &
        LOG_PID=$!
        sleep 5
        kill $LOG_PID 2>/dev/null || true
        echo ""
        
        # Test API endpoints
        echo "=== API Health Tests ==="
        echo "Testing /api/hello..."
        curl -f http://localhost:3000/api/hello || echo "❌ /api/hello failed"
        echo ""
        
        echo "Testing /api/auth/check..."
        curl -f http://localhost:3000/api/auth/check || echo "❌ /api/auth/check failed"
        echo ""
        
        # Check environment variables
        echo "=== Environment Variables ==="
        docker exec -it $CONTAINER_ID env | grep -E "(NEXTAUTH|DATABASE|THINGSBOARD)" || echo "❌ No auth env vars found"
        echo ""
EOF
}

# Function to check database connection
check_database() {
    echo "🗄️ Checking database connection..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== Database Connection Test ==="
        
        CONTAINER_ID=$(docker ps -q --filter name=hmwebapp)
        if [ ! -z "$CONTAINER_ID" ]; then
            echo "Testing database connection from container..."
            docker exec -it $CONTAINER_ID node -e "
                const sql = require('mssql');
                const config = {
                    user: process.env.MSSQL_USER,
                    password: process.env.MSSQL_PASSWORD,
                    server: process.env.MSSQL_SERVER,
                    database: process.env.MSSQL_DATABASE,
                    options: { encrypt: true, trustServerCertificate: true }
                };
                
                sql.connect(config).then(() => {
                    console.log('✅ Database connection successful');
                    return sql.query('SELECT 1 as test');
                }).then(result => {
                    console.log('✅ Database query successful:', result.recordset);
                    sql.close();
                }).catch(err => {
                    console.error('❌ Database connection failed:', err.message);
                    process.exit(1);
                });
            " || echo "❌ Database test failed"
        else
            echo "❌ Container not found"
        fi
        echo ""
EOF
}

# Function to check NextAuth configuration
check_nextauth() {
    echo "🔐 Checking NextAuth configuration..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== NextAuth Configuration ==="
        
        CONTAINER_ID=$(docker ps -q --filter name=hmwebapp)
        if [ ! -z "$CONTAINER_ID" ]; then
            echo "NextAuth Environment Variables:"
            docker exec -it $CONTAINER_ID env | grep -E "(NEXTAUTH|AUTH)" || echo "❌ No NextAuth env vars"
            echo ""
            
            echo "Testing NextAuth endpoints:"
            echo "Testing /api/auth/signin..."
            curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/signin || echo "❌ Signin endpoint failed"
            echo ""
            
            echo "Testing /api/auth/session..."
            curl -s http://localhost:3000/api/auth/session || echo "❌ Session endpoint failed"
            echo ""
        fi
        echo ""
EOF
}

# Function to check ThingsBoard connection
check_thingsboard() {
    echo "📡 Checking ThingsBoard connection..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== ThingsBoard Connection Test ==="
        
        CONTAINER_ID=$(docker ps -q --filter name=hmwebapp)
        if [ ! -z "$CONTAINER_ID" ]; then
            echo "ThingsBoard Environment Variables:"
            docker exec -it $CONTAINER_ID env | grep -E "(THINGSBOARD|TB)" || echo "❌ No ThingsBoard env vars"
            echo ""
            
            echo "Testing ThingsBoard URL..."
            TB_URL=$(docker exec -it $CONTAINER_ID env | grep THINGSBOARD_URL | cut -d'=' -f2)
            if [ ! -z "$TB_URL" ]; then
                echo "ThingsBoard URL: $TB_URL"
                curl -f "$TB_URL/api/auth/user" || echo "❌ ThingsBoard connection failed"
            else
                echo "❌ THINGSBOARD_URL not set"
            fi
            echo ""
        fi
        echo ""
EOF
}

# Function to test login manually
test_login() {
    echo "🔑 Testing login manually..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== Manual Login Test ==="
        
        # Test login endpoint
        echo "Testing login endpoint with test credentials..."
        curl -X POST http://localhost:3000/api/auth/signin \
            -H "Content-Type: application/json" \
            -d '{"username":"test","password":"test"}' \
            -v || echo "❌ Login endpoint test failed"
        echo ""
        
        # Check if login page is accessible
        echo "Testing login page accessibility..."
        curl -f http://localhost:3000/auth/signin || echo "❌ Login page not accessible"
        echo ""
        
        # Check for any authentication errors in logs
        echo "=== Authentication Errors in Logs ==="
        docker-compose -f docker-compose.simple.yml logs | grep -i "auth\|login\|signin\|error" || echo "No auth-related logs found"
        echo ""
EOF
}

# Function to check network connectivity
check_network() {
    echo "🌐 Checking network connectivity..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== Network Connectivity ==="
        
        echo "Local network interfaces:"
        ip addr show | grep -E "(inet|UP)" || echo "❌ Network info not available"
        echo ""
        
        echo "Firewall status:"
        ufw status || iptables -L || echo "❌ Firewall info not available"
        echo ""
        
        echo "DNS resolution:"
        nslookup google.com || echo "❌ DNS resolution failed"
        echo ""
        
        echo "Port 3000 status:"
        ss -tulpn | grep :3000 || echo "❌ Port 3000 not listening"
        echo ""
EOF
}

# Function to restart application
restart_app() {
    echo "🔄 Restarting application..."
    sshpass -p "$PASSWORD" ssh "$USERNAME@$SERVER" << 'EOF'
        echo "=== Restarting Application ==="
        
        echo "Stopping containers..."
        docker-compose -f docker-compose.simple.yml down
        
        echo "Starting containers..."
        docker-compose -f docker-compose.simple.yml up -d
        
        echo "Waiting for startup..."
        sleep 30
        
        echo "Checking status..."
        docker-compose -f docker-compose.simple.yml ps
        
        echo "Testing health..."
        curl -f http://localhost:3000/api/hello && echo "✅ Application restarted successfully" || echo "❌ Restart failed"
        echo ""
EOF
}

# Function to show comprehensive debug
comprehensive_debug() {
    echo "🔍 Comprehensive Authentication Debug"
    echo "=================================="
    
    check_container_status
    check_app_health
    check_database
    check_nextauth
    check_thingsboard
    test_login
    check_network
    
    echo "📋 Summary of findings:"
    echo "1. Container Status: Check if container is running"
    echo "2. Application Health: Check if app responds on port 3000"
    echo "3. Database Connection: Check if database is accessible"
    echo "4. NextAuth Config: Check authentication configuration"
    echo "5. ThingsBoard Connection: Check external service connection"
    echo "6. Login Test: Test actual login functionality"
    echo "7. Network: Check network connectivity"
}

# Main menu
show_menu() {
    echo "🔍 Authentication Debug Menu:"
    echo ""
    echo "1. Check container status"
    echo "2. Check application health"
    echo "3. Check database connection"
    echo "4. Check NextAuth configuration"
    echo "5. Check ThingsBoard connection"
    echo "6. Test login manually"
    echo "7. Check network connectivity"
    echo "8. Restart application"
    echo "9. Comprehensive debug (all checks)"
    echo "0. Exit"
    echo ""
    read -p "Choose option (0-9): " choice
    
    case $choice in
        1) check_container_status ;;
        2) check_app_health ;;
        3) check_database ;;
        4) check_nextauth ;;
        5) check_thingsboard ;;
        6) test_login ;;
        7) check_network ;;
        8) restart_app ;;
        9) comprehensive_debug ;;
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
    comprehensive_debug
fi 