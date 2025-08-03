#!/bin/bash

# HMWebApp SCP Deployment Script
set -e

# Default values
SERVER=${1:-"webapp02.heatmanager.cloud"}
USERNAME=${2:-"root"}
REMOTE_PATH=${3:-"/home/$USERNAME/hmwebapp"}
PASSWORD=${4:-"Ch!l!net$$01"}

echo "🚀 HMWebApp SCP Deployment"
echo "Server: $SERVER"
echo "Username: $USERNAME"
echo "Remote path: $REMOTE_PATH"
echo "Authentication: Password"
echo ""

# Create remote directory
echo "📁 Creating remote directory..."
ssh -i "$SSH_KEY" "$USERNAME@$SERVER" "mkdir -p $REMOTE_PATH"

# Upload core files
echo "📤 Uploading core application files..."
scp -i "$SSH_KEY" -r pages/ components/ contexts/ lib/ styles/ public/ "$USERNAME@$SERVER:$REMOTE_PATH/"
scp -i "$SSH_KEY" package.json package-lock.json next.config.js jsconfig.json server.js middleware.js "$USERNAME@$SERVER:$REMOTE_PATH/"

# Upload Docker files
echo "🐳 Uploading Docker files..."
scp -i "$SSH_KEY" Dockerfile.simple docker-compose.simple.yml .dockerignore docker-build.sh "$USERNAME@$SERVER:$REMOTE_PATH/"

# Upload deployment scripts
echo "📜 Uploading deployment scripts..."
scp -i "$SSH_KEY" install-service.sh uninstall-service.sh hmwebapp.service deploy.sh deploy-azure.sh startup.sh "$USERNAME@$SERVER:$REMOTE_PATH/"

# Upload config files
echo "⚙️ Uploading configuration files..."
scp -i "$SSH_KEY" azure.yaml vercel.json web.config ecosystem.config.js .deployment "$USERNAME@$SERVER:$REMOTE_PATH/"

# Upload documentation
echo "📚 Uploading documentation..."
scp -i "$SSH_KEY" README.md DEPLOYMENT_FILES.md "$USERNAME@$SERVER:$REMOTE_PATH/"
scp -i "$SSH_KEY" -r docs/ examples/ "$USERNAME@$SERVER:$REMOTE_PATH/"

# Create .env.example
echo "🔧 Creating .env.example..."
cat > .env.example << 'EOF'
# Database Configuration
MSSQL_USER=your_db_user
MSSQL_PASSWORD=your_db_password
MSSQL_SERVER=your_db_server
MSSQL_DATABASE=your_db_name

# NextAuth Configuration
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your_nextauth_secret

# ThingsBoard Configuration
THINGSBOARD_URL=https://your-thingsboard.com
THINGSBOARD_USERNAME=your_tb_username
THINGSBOARD_PASSWORD=your_tb_password

# Email Configuration
EMAIL_SERVER_HOST=your_smtp_host
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your_email_user
EMAIL_SERVER_PASSWORD=your_email_password
EMAIL_FROM=noreply@your-domain.com
EOF

scp -i "$SSH_KEY" .env.example "$USERNAME@$SERVER:$REMOTE_PATH/"
rm .env.example

# Create server deployment script
echo "📋 Creating server deployment script..."
cat > deploy-on-server.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting HMWebApp deployment..."

# Check .env file
if [ ! -f .env ]; then
    echo "❌ .env file not found! Please create from .env.example"
    exit 1
fi

# Install Docker if needed
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# Install Docker Compose if needed
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.simple.yml down || true

# Build and start
echo "🔨 Building and starting containers..."
docker-compose -f docker-compose.simple.yml up -d --build

# Wait and check health
echo "⏳ Waiting for application..."
sleep 30

if curl -f http://localhost:3000/api/hello; then
    echo "✅ Deployment successful!"
    echo "🌐 Application: http://localhost:3000"
    echo "📋 Logs: docker-compose -f docker-compose.simple.yml logs -f"
else
    echo "❌ Health check failed!"
    docker-compose -f docker-compose.simple.yml logs
    exit 1
fi
EOF

scp -i "$SSH_KEY" deploy-on-server.sh "$USERNAME@$SERVER:$REMOTE_PATH/"
ssh -i "$SSH_KEY" "$USERNAME@$SERVER" "chmod +x $REMOTE_PATH/deploy-on-server.sh"
rm deploy-on-server.sh

echo ""
echo "✅ Upload completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. SSH to server: ssh $USERNAME@$SERVER"
echo "2. Navigate to app: cd $REMOTE_PATH"
echo "3. Create .env file: cp .env.example .env && nano .env"
echo "4. Run deployment: ./deploy-on-server.sh"
echo ""
echo "🚀 Or run remotely:"
echo "ssh $USERNAME@$SERVER 'cd $REMOTE_PATH && ./deploy-on-server.sh'" 