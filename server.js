import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || 'doi-mat-khau-nay';
const dataDir = path.join(root, 'data');
await mkdir(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'hotel.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
    description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), capacity INTEGER NOT NULL CHECK(capacity > 0),
    image TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL REFERENCES rooms(id),
    guest_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, guests INTEGER NOT NULL,
    check_in TEXT NOT NULL, check_out TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const roomCount = db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
if (!roomCount) {
  const add = db.prepare('INSERT INTO rooms(name,category,description,price,capacity,image,tag) VALUES(?,?,?,?,?,?,?)');
  [
    ['Phòng Deluxe hướng vườn', 'Deluxe', 'Không gian yên tĩnh với ban công riêng nhìn ra khu vườn xanh.', 1450000, 2, 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1000&q=85', 'Được yêu thích'],
    ['Phòng Suite thành phố', 'Suite', 'Phòng suite rộng rãi, cửa kính lớn và khu vực tiếp khách riêng.', 2380000, 2, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1000&q=85', 'Tầm nhìn đẹp'],
    ['Phòng gia đình', 'Family', 'Hai giường thoải mái, phù hợp cho kỳ nghỉ cùng gia đình nhỏ.', 1980000, 4, 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1000&q=85', 'Rộng rãi'],
    ['Phòng Superior', 'Superior', 'Thiết kế tối giản, đầy đủ tiện nghi cho chuyến công tác hoặc nghỉ ngắn ngày.', 1120000, 2, 'https://images.unsplash.com/photo-1611892440504-4a26c7c5a7dd?auto=format&fit=crop&w=1000&q=85', 'Giá tốt'],
    ['Phòng Executive', 'Executive', 'Tận hưởng giường cỡ lớn, nội thất cao cấp và dịch vụ ưu tiên.', 2850000, 2, 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1000&q=85', 'Cao cấp'],
    ['Phòng gia đình Premium', 'Family', 'Không gian thoáng đãng với hai khu nghỉ riêng và tiện nghi cho trẻ nhỏ.', 2650000, 5, 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1000&q=85', 'Cho cả nhà'],
  ].forEach((r) => add.run(...r));
}

const sessions = new Set();
const pendingStatuses = ['pending', 'confirmed'];
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const send = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 24_000) throw new Error('Dữ liệu gửi lên quá lớn.'); }
  return raw ? JSON.parse(raw) : {};
}
function isAdmin(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('hotel_session='))?.slice(14);
  return Boolean(token && sessions.has(token));
}
function secureEqual(a, b) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function validDates(start, end) {
  const validDay = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  return validDay(start) && validDay(end) && start < end;
}
const available = db.prepare(`SELECT r.* FROM rooms r WHERE r.active=1 AND r.capacity>=? AND NOT EXISTS (
  SELECT 1 FROM bookings b WHERE b.room_id=r.id AND b.status IN ('pending','confirmed')
  AND b.check_in < ? AND b.check_out > ?
) ORDER BY r.price ASC`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/rooms') {
      const start = url.searchParams.get('checkIn'); const end = url.searchParams.get('checkOut'); const guests = Math.max(1, Number(url.searchParams.get('guests') || 1));
      const rooms = validDates(start, end) ? available.all(guests, end, start) : db.prepare('SELECT * FROM rooms WHERE active=1 AND capacity>=? ORDER BY price').all(guests);
      return send(res, 200, { rooms });
    }
    if (req.method === 'POST' && url.pathname === '/api/bookings') {
      const b = await body(req);
      if (!b.roomId || !b.guestName?.trim() || !b.email?.trim() || !b.phone?.trim() || !validDates(b.checkIn, b.checkOut)) return send(res, 400, { error: 'Vui lòng điền đầy đủ thông tin và chọn ngày hợp lệ.' });
      const guests = Number(b.guests); const room = db.prepare('SELECT * FROM rooms WHERE id=? AND active=1').get(Number(b.roomId));
      if (!room || !Number.isInteger(guests) || guests < 1 || guests > room.capacity) return send(res, 400, { error: 'Phòng không tồn tại hoặc không phù hợp với số khách.' });
      if (available.all(guests, b.checkOut, b.checkIn).every(r => r.id !== room.id)) return send(res, 409, { error: 'Phòng vừa được đặt trong khoảng ngày này. Vui lòng chọn phòng khác.' });
      const result = db.prepare(`INSERT INTO bookings(room_id,guest_name,email,phone,guests,check_in,check_out,note) VALUES(?,?,?,?,?,?,?,?)`).run(room.id, b.guestName.trim(), b.email.trim(), b.phone.trim(), guests, b.checkIn, b.checkOut, String(b.note || '').slice(0, 500));
      return send(res, 201, { bookingId: Number(result.lastInsertRowid), message: 'Đã nhận yêu cầu đặt phòng của bạn.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const b = await body(req);
      if (!secureEqual(String(b.password || ''), adminPassword)) return send(res, 401, { error: 'Mật khẩu chưa chính xác.' });
      const token = randomBytes(32).toString('hex'); sessions.add(token);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'set-cookie': `hotel_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` }); return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Vui lòng đăng nhập quản trị.' });
      if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
        const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('hotel_session='))?.slice(14); if (token) sessions.delete(token);
        res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'hotel_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return res.end('{"ok":true}');
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/bookings') return send(res, 200, { bookings: db.prepare(`SELECT b.*, r.name AS room_name, r.price FROM bookings b JOIN rooms r ON r.id=b.room_id ORDER BY b.created_at DESC, b.id DESC`).all() });
      if (req.method === 'GET' && url.pathname === '/api/admin/rooms') return send(res, 200, { rooms: db.prepare('SELECT * FROM rooms ORDER BY id').all() });
      if (req.method === 'PATCH' && /^\/api\/admin\/bookings\/\d+$/.test(url.pathname)) {
        const b = await body(req); if (!['pending', 'confirmed', 'cancelled'].includes(b.status)) return send(res, 400, { error: 'Trạng thái không hợp lệ.' });
        const id = Number(url.pathname.split('/').pop()); const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(id); if (!booking) return send(res, 404, { error: 'Không tìm thấy đơn đặt phòng.' });
        if (b.status === 'confirmed') {
          const conflict = db.prepare(`SELECT 1 FROM bookings WHERE room_id=? AND id<>? AND status IN ('pending','confirmed') AND check_in < ? AND check_out > ? LIMIT 1`).get(booking.room_id, id, booking.check_out, booking.check_in);
          if (conflict) return send(res, 409, { error: 'Phòng bị trùng lịch với một yêu cầu khác đang chờ hoặc đã xác nhận.' });
        }
        db.prepare('UPDATE bookings SET status=? WHERE id=?').run(b.status, id); return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/rooms') {
        const r = await body(req); if (!r.name?.trim() || !r.category?.trim() || !r.description?.trim() || !Number.isInteger(Number(r.price)) || Number(r.price) < 1 || !Number.isInteger(Number(r.capacity)) || Number(r.capacity) < 1 || !r.image?.trim()) return send(res, 400, { error: 'Vui lòng nhập đủ thông tin phòng hợp lệ.' });
        const result = db.prepare('INSERT INTO rooms(name,category,description,price,capacity,image,tag) VALUES(?,?,?,?,?,?,?)').run(r.name.trim(), r.category.trim(), r.description.trim(), Number(r.price), Number(r.capacity), r.image.trim(), String(r.tag || '').trim()); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH' && /^\/api\/admin\/rooms\/\d+$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/').pop()); const r = await body(req); if (!db.prepare('SELECT id FROM rooms WHERE id=?').get(id)) return send(res, 404, { error: 'Không tìm thấy phòng.' });
        if (r.active !== undefined) db.prepare('UPDATE rooms SET active=? WHERE id=?').run(r.active ? 1 : 0, id); return send(res, 200, { ok: true });
      }
    }
    if (req.method === 'GET') {
      const safe = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.resolve(root, 'public', `.${safe}`);
      if (!file.startsWith(path.resolve(root, 'public') + path.sep)) return send(res, 403, { error: 'Forbidden' });
      try { const content = await readFile(file); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); return res.end(content); }
      catch { return send(res, 404, { error: 'Không tìm thấy trang.' }); }
    }
    return send(res, 404, { error: 'Không tìm thấy.' });
  } catch (error) {
    return send(res, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'Dữ liệu gửi lên không hợp lệ.' : error.message || 'Có lỗi xảy ra.' });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Hotel booking is running at http://localhost:${port}`));
