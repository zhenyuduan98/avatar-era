const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 5050;
const TOKEN_PATH = process.env.COPILOT_TOKEN_PATH || path.join(process.env.HOME, '.openclaw/credentials/github-copilot.token.json');
const MODEL = 'gpt-4o';

// Azure Speech (read from env so the key never ships to the browser)
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

function getToken() {
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')).token;
}

// Exchange the subscription key for a short-lived Speech auth token (~10 min).
function handleSpeechToken(res) {
  if (!SPEECH_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'AZURE_SPEECH_KEY not configured' }));
    return;
  }
  const tokenReq = https.request({
    hostname: `${SPEECH_REGION}.api.cognitive.microsoft.com`,
    path: '/sts/v1.0/issueToken',
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': SPEECH_KEY,
      'Content-Length': 0,
    }
  }, (tokenRes) => {
    let data = '';
    tokenRes.on('data', c => data += c);
    tokenRes.on('end', () => {
      if (tokenRes.statusCode !== 200) {
        console.error(`Speech token ${tokenRes.statusCode}: ${data}`);
        res.writeHead(tokenRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'token request failed', status: tokenRes.statusCode }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ token: data, region: SPEECH_REGION }));
    });
  });
  tokenReq.on('error', (e) => {
    console.error('Speech token error:', e.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  });
  tokenReq.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Speech token endpoint (GET): hand the browser a short-lived token, never the key.
  const pathOnly = req.url.split('?')[0];
  if (req.method === 'GET' && (pathOnly === '/speech/token' || pathOnly === '/token')) {
    handleSpeechToken(res);
    return;
  }

  if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const payload = JSON.parse(body);
      payload.model = MODEL;
      payload.stream = true; // Copilot requires streaming

      const token = getToken();
      const data = JSON.stringify(payload);

      const proxyReq = https.request({
        hostname: 'api.enterprise.githubcopilot.com',
        path: '/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'editor-version': 'vscode/1.100.0',
          'copilot-integration-id': 'vscode-chat',
        }
      }, (proxyRes) => {
        if (proxyRes.statusCode !== 200) {
          let errBody = '';
          proxyRes.on('data', c => errBody += c);
          proxyRes.on('end', () => {
            console.error(`Upstream ${proxyRes.statusCode}: ${errBody}`);
            res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(errBody);
          });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (e) => {
        console.error('Proxy error:', e.message);
        res.writeHead(502);
        res.end(JSON.stringify({ error: e.message }));
      });

      proxyReq.write(data);
      proxyReq.end();
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Copilot proxy running on http://0.0.0.0:${PORT}`);
});
