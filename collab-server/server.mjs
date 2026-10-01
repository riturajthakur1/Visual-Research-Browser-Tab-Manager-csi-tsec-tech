// Thread.io relay for live team research.
//
// It forwards encrypted updates between teammates in the same room and keeps
// an encrypted log so late joiners catch up. It never sees research content:
// clients encrypt every update with a key that only exists in invite codes.
//
//   npm run collab:server                 # ws://localhost:4545 and your LAN address
//   PORT=8080 DATA_DIR=./rooms npm run collab:server
//
// Protocol (JSON text frames):
//   → {t:'join', room, id}            ← {t:'welcome', log:[...], peers:n}
//   → {t:'update', d}                 ← {t:'update', d} to everyone else in the room
//   → {t:'snapshot', d, upTo}         replaces log[0, upTo) with one compacted entry
//   → {t:'presence', d}               ← {t:'presence', d, from} to everyone else
//                                     ← {t:'peer-joined', id} so others announce themselves
//                                     ← {t:'peer-left', id} when someone disconnects
//                                     ← {t:'compact', upTo} asks a client to send a snapshot
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOM_ID = /^[A-Za-z0-9_-]{4,80}$/;
const MAX_MESSAGE = 4 * 1024 * 1024;
const COMPACT_AT = 300;
const HEARTBEAT_MS = 20_000;

export function startRelay({ port = 4545, host = '0.0.0.0', dataDir, quiet = false } = {}) {
  const dir = dataDir ?? join(dirname(fileURLToPath(import.meta.url)), 'data');
  mkdirSync(dir, { recursive: true });
  const rooms = new Map();
  const log = (...a) => quiet || console.log(new Date().toISOString().slice(11, 19), ...a);

  function room(id) {
    let r = rooms.get(id);
    if (!r) {
      const file = join(dir, `${id}.json`);
      let saved = [];
      if (existsSync(file)) {
        try {
          saved = JSON.parse(readFileSync(file, 'utf8')).log ?? [];
        } catch {
          saved = [];
        }
      }
      r = { id, file, log: saved, clients: new Set(), timer: null };
      rooms.set(id, r);
    }
    return r;
  }

  function save(r) {
    clearTimeout(r.timer);
    r.timer = setTimeout(() => {
      const tmp = `${r.file}.tmp`;
      writeFileSync(tmp, JSON.stringify({ log: r.log }));
      renameSync(tmp, r.file);
    }, 500);
  }

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const others = (r, ws, msg) => {
    for (const c of r.clients) if (c !== ws) send(c, msg);
  };

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Thread.io relay. Connect with a WebSocket.\n');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE });

  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.t === 'join') {
        if (!ROOM_ID.test(String(msg.room ?? ''))) return send(ws, { t: 'error', error: 'bad room id' });
        if (ws.room) rooms.get(ws.room)?.clients.delete(ws);
        const r = room(msg.room);
        ws.room = r.id;
        ws.member = String(msg.id ?? '').slice(0, 80);
        r.clients.add(ws);
        send(ws, { t: 'welcome', log: r.log, peers: r.clients.size - 1 });
        others(r, ws, { t: 'peer-joined', id: ws.member });
        log(`join ${r.id.slice(0, 10)}… (${r.clients.size} connected)`);
        return;
      }
      const r = ws.room && rooms.get(ws.room);
      if (!r) return;
      if (msg.t === 'update' && typeof msg.d === 'string') {
        r.log.push(msg.d);
        others(r, ws, { t: 'update', d: msg.d });
        save(r);
        if (r.log.length > COMPACT_AT) send(ws, { t: 'compact', upTo: r.log.length });
      } else if (msg.t === 'snapshot' && typeof msg.d === 'string') {
        const upTo = Math.min(Number(msg.upTo) || 0, r.log.length);
        if (upTo > 0) {
          r.log = [msg.d, ...r.log.slice(upTo)];
          save(r);
        }
      } else if (msg.t === 'presence' && typeof msg.d === 'string') {
        others(r, ws, { t: 'presence', d: msg.d, from: ws.member });
      }
    });
    ws.on('close', () => {
      const r = ws.room && rooms.get(ws.room);
      if (!r) return;
      r.clients.delete(ws);
      others(r, ws, { t: 'peer-left', id: ws.member });
    });
  });

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, HEARTBEAT_MS);

  return new Promise((resolve) => {
    http.listen(port, host, () => {
      const actual = http.address().port;
      const lan = Object.values(networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => `ws://${i.address}:${actual}`);
      log(`Thread.io relay on ws://localhost:${actual}`);
      for (const url of lan) log(`  teammates on this network: ${url}`);
      resolve({
        port: actual,
        urls: [`ws://localhost:${actual}`, ...lan],
        rooms,
        close: () =>
          new Promise((done) => {
            clearInterval(beat);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await startRelay({ port: Number(process.env.PORT) || 4545, dataDir: process.env.DATA_DIR });
}
