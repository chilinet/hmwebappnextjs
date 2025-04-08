require('dotenv').config();
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { startScheduler } = require('./lib/scheduler');

const PORT = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

console.log('Starting server initialization...');

app.prepare()
  .then(() => {
    console.log('Next.js app prepared');

    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    });

    server.listen(PORT, (err) => {
      if (err) {
        console.error('Failed to start server:', err);
        throw err;
      }
      console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
      
      try {
        startScheduler();
        console.log('Scheduler started successfully');
      } catch (schedulerError) {
        console.error('Failed to start scheduler:', schedulerError);
      }
    });
  })
  .catch((err) => {
    console.error('Failed to prepare Next.js app:', err);
    process.exit(1);
  });