const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GOOGLE_API_KEY || '';
const MODEL = process.env.GOOGLE_VEO_MODEL || 'veo-3.1-generate-preview';
const API_BASE = process.env.GOOGLE_API_BASE_URL || 'https://generativelanguage.googleapis.com';
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function sendJson(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 3_000_000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

async function googleRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const message = data.error?.message || data.message || `Google API returned ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function operationUrl(name) {
  if (/^https?:/.test(name)) return name;
  const cleanName = name.replace(/^\/+/, '');
  return `${API_BASE}/v1beta/${cleanName}`;
}

function extractVideoUrl(operation) {
  const response = operation.response || operation.result?.response || {};
  const candidates = [
    response.generateVideoResponse?.generatedSamples,
    response.generatedSamples,
    response.videos,
    operation.generatedSamples
  ];
  for (const list of candidates) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const uri = item.video?.uri || item.uri || item.url || item.videoUrl;
      if (uri) return uri;
    }
  }
  return null;
}

async function getOperation(operationName) {
  let url = operationUrl(operationName);
  url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(API_KEY)}`;
  const operation = await googleRequest(url);
  if (operation.done) {
    if (operation.error) throw new Error(operation.error.message || 'Video generation failed');
    const videoUrl = extractVideoUrl(operation);
    if (!videoUrl) throw new Error('The generation completed but no video URL was returned');
    return { done: true, videoUrl };
  }
  return { done: false };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/status') {
    sendJson(res, 200, { configured: Boolean(API_KEY), provider: 'Google Veo', model: MODEL });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    if (!API_KEY) {
      sendJson(res, 503, { error: 'GOOGLE_API_KEY is not configured on the server' });
      return;
    }
    try {
      const body = await readJson(req);
      const prompt = String(body.prompt || '').trim().slice(0, 2000);
      if (!prompt) {
        sendJson(res, 400, { error: 'Prompt is required' });
        return;
      }

      const aspectRatio = String(body.aspectRatio || '16:9').includes('9:16') ? '9:16'
        : String(body.aspectRatio || '16:9').includes('1:1') ? '1:1' : '16:9';
      const durationSeconds = Math.min(8, Math.max(5, parseInt(body.durationSeconds, 10) || 8));
      const style = String(body.style || 'Cinematic Realistic').slice(0, 100);
      const camera = String(body.camera || 'Auto / Smart Camera').slice(0, 100);
      const fps = String(body.fps || '30 FPS').slice(0, 30);
      const resolution = String(body.resolution || '720p').includes('720') ? '720p' : '1080p';
      const audio = String(body.audio || 'No audio').slice(0, 100);
      const cameraDirection = camera === 'Auto / Smart Camera' ? 'natural motivated camera movement'
        : camera.toLowerCase();
      const audioDirection = audio === 'No audio' ? 'no added soundtrack'
        : `with ${audio.toLowerCase()}`;
      const enhancedPrompt = body.promptEnhancement === false ? prompt
        : `${prompt}. Visual style: ${style}. Cinematic realism, coherent anatomy and objects, realistic physics, natural skin and fabric detail, physically plausible shadows and reflections, continuous motion, ${cameraDirection}, ${audioDirection}, ${resolution} quality, approximately ${fps}, professional color grading, no text, no logo, no watermark, no abrupt cuts.`;
      const instance = { prompt: enhancedPrompt };
      if (typeof body.referenceImage === 'string' && body.referenceImage.startsWith('data:image/')) {
        const match = body.referenceImage.match(/^data:(image\/[-+.a-zA-Z0-9]+);base64,(.+)$/);
        if (match) instance.image = { mimeType: match[1], bytesBase64Encoded: match[2] };
      }

      const endpoint = `${API_BASE}/v1beta/models/${encodeURIComponent(MODEL)}:predictLongRunning?key=${encodeURIComponent(API_KEY)}`;
      const operation = await googleRequest(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [instance],
          parameters: { aspectRatio, durationSeconds }
        })
      });
      const operationName = operation.name;
      if (!operationName) throw new Error('Google did not return an operation name');
      sendJson(res, 202, { operationName });
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/operation') {
    const operationName = url.searchParams.get('name');
    if (!operationName) {
      sendJson(res, 400, { error: 'Operation name is required' });
      return;
    }
    try {
      const result = await getOperation(operationName);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/download') {
    const remoteUrl = url.searchParams.get('url');
    if (!remoteUrl) {
      sendJson(res, 400, { error: 'Video URL is required' });
      return;
    }
    try {
      const parsed = new URL(remoteUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('googleapis.com')) {
        sendJson(res, 400, { error: 'Only Google-generated video URLs are allowed' });
        return;
      }
      const separator = parsed.search ? '&' : '?';
      if (API_KEY) parsed.searchParams.set('key', API_KEY);
      const upstream = await fetch(parsed.toString());
      if (!upstream.ok) throw new Error(`Video download returned ${upstream.status}`);
      res.writeHead(200, {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'private, no-store'
      });
      if (upstream.body) {
        const reader = upstream.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        };
        pump().catch(() => res.end());
      } else {
        res.end(Buffer.from(await upstream.arrayBuffer()));
      }
    } catch (error) {
      sendJson(res, 502, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'API route not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    return;
  }

  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === '/') relativePath = '/Index.html';
  const filePath = path.resolve(ROOT, '.' + relativePath);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`CineForge running at http://localhost:${PORT}`);
  console.log(API_KEY ? 'Google Veo API configured' : 'Google Veo API not configured');
});
