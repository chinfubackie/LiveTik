// เซิร์ฟเวอร์ลอยกระทงออนไลน์
// หน้าฉาก:  http://localhost:3000/        หน้าตั้งค่า:  http://localhost:3000/settings.html
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CONF = path.join(DIR, 'config.json');
const DEFAULTS = {
  port: 3000,
  tiktokUser: '',
  sessionId: '',
  title: 'ลอยกระทงออนไลน์',
  hint: '🎁 ส่งของขวัญเพื่อลอยกระทง',
  goal: 100,
  defaultWish: 'ขอให้ทุกคนมีความสุข',
  maxWishLength: 60,
  tier2Coins: 10,
  tier3Coins: 100,
  cardSeconds: 3.2,
  lightSeconds: 2.2,
  lowerSeconds: 1.8,
  lanternCount: 14,
  showCounter: true,
  useChatAsWish: true,
  soundOn: true,
  volume: 0.5,
  badWords: 'ควย,เหี้ย,สัส,fuck,shit',
};

let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONF, 'utf8')) }; } catch {}
const saveCfg = () => fs.writeFileSync(CONF, JSON.stringify(cfg, null, 2));
if (!fs.existsSync(CONF)) saveCfg();

const PORT = process.env.PORT || cfg.port;
const clients = new Set();
const lastWish = new Map();
let connState = { status: 'ปิดอยู่', detail: '', ok: false };
let conn = null;
const logs = [];
const addLog = (text) => {
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  logs.unshift(`[${time}] ${text}`);
  if (logs.length > 25) logs.length = 25;
};

const clean = (t = '') => {
  let s = String(t).slice(0, cfg.maxWishLength);
  cfg.badWords.split(',').map(w => w.trim()).filter(Boolean).forEach(w => { s = s.split(w).join('♥'); });
  return s;
};
const tierOf = c => (c >= cfg.tier3Coins ? 3 : c >= cfg.tier2Coins ? 2 : 1);
const send = (obj) => { const d = `data: ${JSON.stringify(obj)}\n\n`; clients.forEach(r => r.write(d)); };
const gift = (g) => send({ type: 'gift', ...g });

function connectTikTok() {
  if (conn) { try { conn.disconnect(); } catch {} conn = null; }
  if (!cfg.tiktokUser) { connState = { status: 'ปิดอยู่', detail: 'ยังไม่ได้ใส่ชื่อผู้ใช้ TikTok (โหมดทดสอบ)', ok: false }; return; }
  let C;
  try { C = require('tiktok-live-connector').WebcastPushConnection; }
  catch { connState = { status: 'ผิดพลาด', detail: 'ยังไม่ได้ติดตั้ง: npm i tiktok-live-connector', ok: false }; return; }
  const user = cfg.tiktokUser.replace(/^@/, '').trim();
  connState = { status: 'กำลังเชื่อมต่อ', detail: '@' + user, ok: false };
  addLog(`กำลังเชื่อมต่อ @${user}...`);
  const opts = cfg.sessionId ? { sessionId: cfg.sessionId.trim() } : {};
  const c = conn = new C(user, opts);
  const retry = () => { if (conn === c) setTimeout(() => conn === c && connectTikTok(), 15000); };
  c.connect().then(s => {
    connState = { status: 'เชื่อมต่อแล้ว', detail: `@${user} (ห้อง ${s.roomId})`, ok: true };
    addLog(`เชื่อมต่อสำเร็จ @${user} (ห้อง ${s.roomId})`);
  }).catch(e => {
    const msg = String(e.message || e).slice(0, 120);
    connState = { status: 'เชื่อมต่อไม่ได้', detail: msg + ' — จะลองใหม่ใน 15 วิ', ok: false };
    addLog(`เชื่อมต่อไม่ได้: ${msg}`);
    retry();
  });
  c.on('disconnected', () => { connState = { status: 'หลุด', detail: 'จะต่อใหม่อัตโนมัติ', ok: false }; addLog('การเชื่อมต่อหลุด จะต่อใหม่...'); retry(); });
  c.on('streamEnd', () => { connState = { status: 'ไลฟ์จบแล้ว', detail: '', ok: false }; addLog('ไลฟ์จบแล้ว'); });
  c.on('chat', d => {
    const w = clean(d.comment);
    lastWish.set(d.uniqueId, w);
    addLog(`💬 ${d.nickname || d.uniqueId}: ${w}`);
  });
  c.on('gift', d => {
    if (d.giftType === 1 && !d.repeatEnd) return;
    const coins = (d.diamondCount || 1) * (d.repeatCount || 1);
    const wish = (cfg.useChatAsWish && lastWish.get(d.uniqueId)) || cfg.defaultWish;
    const u = d.nickname || d.uniqueId;
    addLog(`🎁 ${u} ส่ง ${d.giftName || 'ของขวัญ'} (${coins} เหรียญ) → "${wish}"`);
    gift({
      user: u, avatar: d.profilePictureUrl || '',
      wish, tier: tierOf(coins),
    });
  });
}

const readBody = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
const json = (res, o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    const ka = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clients.delete(res); clearInterval(ka); });
  } else if (url.pathname === '/config' && req.method === 'GET') {
    json(res, cfg);
  } else if (url.pathname === '/config' && req.method === 'POST') {
    try {
      const inc = JSON.parse(await readBody(req));
      const userChanged = inc.tiktokUser !== undefined && inc.tiktokUser !== cfg.tiktokUser;
      for (const k of Object.keys(DEFAULTS)) {
        if (inc[k] === undefined) continue;
        cfg[k] = typeof DEFAULTS[k] === 'number' ? (Number(inc[k]) || DEFAULTS[k])
               : typeof DEFAULTS[k] === 'boolean' ? !!inc[k] : String(inc[k]);
      }
      saveCfg(); send({ type: 'config', config: cfg });
      if (userChanged) connectTikTok();
      json(res, { ok: true, config: cfg, note: inc.port && inc.port !== PORT ? 'พอร์ตใหม่มีผลเมื่อรีสตาร์ท' : '' });
    } catch (e) { json(res, { ok: false, error: String(e) }, 400); }
  } else if (url.pathname === '/connect' && req.method === 'POST') {
    try {
      const inc = JSON.parse(await readBody(req));
      if (inc.tiktokUser !== undefined) cfg.tiktokUser = String(inc.tiktokUser).replace(/^@/, '').trim();
      if (inc.sessionId !== undefined) cfg.sessionId = String(inc.sessionId).trim();
      saveCfg(); connectTikTok();
      json(res, { ok: true, state: connState });
    } catch (e) { json(res, { ok: false, error: String(e) }, 400); }
  } else if (url.pathname === '/disconnect' && req.method === 'POST') {
    if (conn) { try { conn.disconnect(); } catch {} conn = null; }
    cfg.tiktokUser = ''; saveCfg();
    connState = { status: 'ปิดอยู่', detail: 'ตัดการเชื่อมต่อแล้ว (โหมดทดสอบ)', ok: false };
    addLog('ตัดการเชื่อมต่อห้องไลฟ์');
    json(res, { ok: true, state: connState });
  } else if (url.pathname === '/status') {
    json(res, { ...connState, tiktokUser: cfg.tiktokUser, viewers: clients.size, port: PORT, logs });
  } else if (url.pathname === '/test') {
    const coins = +url.searchParams.get('coins') || 1;
    gift({ user: url.searchParams.get('user') || 'ผู้ชม', avatar: '', wish: clean(url.searchParams.get('wish') || 'ขอให้โชคดี สุขภาพแข็งแรง'), tier: tierOf(coins) });
    json(res, { ok: true });
  } else if (url.pathname === '/reset') {
    send({ type: 'reset' }); json(res, { ok: true });
  } else {
    const root = path.join(DIR, 'public');
    const file = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.error(`พอร์ต ${PORT} ถูกใช้อยู่ — อาจเปิดโปรแกรมนี้ไว้แล้วที่ http://localhost:${PORT}`); process.exit(1); }
  throw e;
});
server.listen(PORT, '0.0.0.0', () => { console.log(`พร้อมใช้งาน http://localhost:${PORT}  |  ตั้งค่า http://localhost:${PORT}/settings.html`); connectTikTok(); });
