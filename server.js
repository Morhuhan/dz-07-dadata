// Проект к занятию 7.
// Запуск:  node server.js
// Ключ читается из файла .env и остаётся здесь, на сервере.
// В браузер он не уходит — страница обращается только к этому серверу.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DADATA_HOST = 'suggestions.dadata.ru';
const DADATA_PATH = '/suggestions/api/4_1/rs/suggest/party';

// ---------- читаем .env ----------

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = val;
  }
  return out;
}

const env = readEnv(path.join(__dirname, '.env'));
const TOKEN = env.DADATA_TOKEN || '';
const PORT = Number(env.PORT || process.env.PORT || 3000);

// ---------- запрос в Dadata ----------

function askDadata(query, count, status, type) {
  return new Promise((resolve) => {
    const payload = { query: query, count: count };
    if (status && status.length) payload.status = status;
    if (type) payload.type = type;

    const body = JSON.stringify(payload);

    const req = https.request({
      host: DADATA_HOST,
      path: DADATA_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Token ' + TOKEN,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ code: res.statusCode, raw: raw }));
    });

    req.on('error', (e) => {
      resolve({ code: 0, raw: JSON.stringify({ error: 'Запрос не ушёл: ' + e.message }) });
    });

    req.write(body);
    req.end();
  });
}

// ---------- сервер ----------

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'GET' && url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && url === '/search') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      let query = '';
      let count = 10;
      let status = null;
      let type = null;
      try {
        const got = JSON.parse(raw || '{}');
        query = String(got.query || '').trim();
        if (got.count) count = Number(got.count);
        if (Array.isArray(got.status) && got.status.length) status = got.status;
        if (got.type) type = String(got.type);
      } catch (e) {
        return sendJson(res, 400, { ошибка: 'Тело запроса — не JSON' });
      }

      if (!query) {
        return sendJson(res, 400, { ошибка: 'Пустой запрос' });
      }

      if (!TOKEN) {
        console.log('  нет ключа — запрос не отправлен');
        return sendJson(res, 500, {
          ошибка: 'Ключ не найден. Создай рядом с server.js файл .env и положи в него строку DADATA_TOKEN=твой_ключ, потом перезапусти сервер.'
        });
      }

      const filters = (type ? ' type=' + type : '') + (status ? ' status=' + status.join(',') : '');
      console.log('→ POST ' + DADATA_HOST + '   запрос: "' + query + '"' + filters);
      const answer = await askDadata(query, count, status, type);

      let parsed = null;
      try {
        parsed = JSON.parse(answer.raw);
      } catch (e) {
        parsed = { ответ_не_json: answer.raw };
      }

      const found = parsed && parsed.suggestions ? parsed.suggestions.length : 0;
      console.log('← ' + answer.code + '   найдено: ' + found);

      return sendJson(res, 200, { код: answer.code, ответ: parsed });
    });
    return;
  }

  sendJson(res, 404, { ошибка: 'Нет такого адреса', путь: req.url });
});

server.listen(PORT, '127.0.0.1', () => {
  const mask = TOKEN ? 'найден, оканчивается на ' + TOKEN.slice(-4) : 'НЕ НАЙДЕН — смотри .env.example';
  console.log('');
  console.log('  Проект запущен:  http://localhost:' + PORT);
  console.log('  Ключ из .env:    ' + mask);
  console.log('');
  console.log('  Останов — Ctrl+C. Ниже будет видно каждый запрос.');
  console.log('');
});
