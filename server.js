require('dotenv').config();
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { startScheduler } = require('./lib/scheduler');

const PORT = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

console.log('=== Next.js Server Starting ===');
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', PORT);
console.log('Dev mode:', dev);
console.log('Current directory:', process.cwd());

// Check if .next directory exists
const fs = require('fs');
const path = require('path');
const nextDir = path.join(process.cwd(), '.next');

if (!fs.existsSync(nextDir)) {
    console.error('ERROR: .next directory not found!');
    console.error('Available files in current directory:');
    try {
        const files = fs.readdirSync(process.cwd());
        console.error(files);
    } catch (err) {
        console.error('Could not read directory:', err.message);
    }
    process.exit(1);
}

const buildIdPath = path.join(nextDir, 'BUILD_ID');
if (!fs.existsSync(buildIdPath)) {
    console.error('ERROR: BUILD_ID not found in .next directory!');
    console.error('Contents of .next directory:');
    try {
        const files = fs.readdirSync(nextDir);
        console.error(files);
    } catch (err) {
        console.error('Could not read .next directory:', err.message);
    }
    process.exit(1);
}

console.log('Build verification successful. BUILD_ID:', fs.readFileSync(buildIdPath, 'utf8'));

app.prepare()
  .then(() => {
    console.log('Next.js app prepared successfully');

    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    });

    server.listen(PORT, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        throw err;
      }
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🌐 External URL: https://${process.env.WEBSITE_HOSTNAME || 'localhost'}`);
      
      try {
        startScheduler();
        console.log('Scheduler started successfully');
      } catch (schedulerError) {
        console.error('Failed to start scheduler:', schedulerError);
      }
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    console.error('Failed to prepare Next.js app:', err);
    process.exit(1);
  });