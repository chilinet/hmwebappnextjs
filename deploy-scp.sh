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

# Upload only the built application
echo "📤 Uploading built application..."
scp -i "$SSH_KEY" -r .next/ "$USERNAME@$SERVER:$REMOTE_PATH/"
scp -i "$SSH_KEY" -r public/ "$USERNAME@$SERVER:$REMOTE_PATH/"
scp -i "$SSH_KEY" package.json package-lock.json next.config.js jsconfig.json server.js middleware.js "$USERNAME@$SERVER:$REMOTE_PATH/"



# Upload deployment scripts
echo "📜 Uploading deployment scripts..."
scp -i "$SSH_KEY" install-service.sh uninstall-service.sh hmwebapp.service deploy.sh deploy-azure.sh startup.sh "$USERNAME@$SERVER:$REMOTE_PATH/"

# Upload config files
echo "⚙️ Uploading configuration files..."
scp -i "$SSH_KEY" azure.yaml vercel.json web.config ecosystem.config.js .deployment "$USERNAME@$SERVER:$REMOTE_PATH/"

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

# Install dependencies with fallback
echo "📦 Installing dependencies..."
if ! npm ci; then
    echo "⚠️ npm ci failed, trying npm install..."
    npm install
fi

# Start the application
echo "🚀 Starting application..."
npm start

# Wait and check health
echo "⏳ Waiting for application..."
sleep 10

if curl -f http://localhost:3000/api/hello; then
    echo "✅ Deployment successful!"
    echo "🌐 Application: http://localhost:3000"
    echo "📋 Logs: npm start"
else
    echo "❌ Health check failed!"
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