const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const PORT = process.env.PORT || 8080; // Nutze Port 8080, falls keiner gesetzt ist
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(PORT, (err) => {
    if (err) throw err;
    console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
  });
});