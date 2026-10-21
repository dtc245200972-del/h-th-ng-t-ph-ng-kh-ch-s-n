const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('vi-VN').format(value) + '₫';
const state = { rooms: [], selectedRoom: null, adminTab: 'bookings' };
const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
const isoDay = d => d.toISOString().slice(0, 10);
const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);
$('#searchCheckIn').value = isoDay(tomorrow); $('#searchCheckOut').value = isoDay(dayAfter);
$('#bookingCheckIn').min = isoDay(tomorrow); $('#bookingCheckOut').min = isoDay(dayAfter);

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Có lỗi xảy ra.'); error.status = response.status; throw error; }
  return data;
}
function roomCard(room) {
  const image = room.image.replaceAll('"', '&quot;');
  return `<article class="room-card"><div class="room-photo"><img src="${image}" alt="${room.name.replaceAll('"', '&quot;')}" loading="lazy"><span class="room-tag">${escapeHtml(room.tag || room.category)}</span></div><div class="room-details"><span class="room-category">${escapeHtml(room.category.toUpperCase())}</span><h3>${escapeHtml(room.name)}</h3><p>${escapeHtml(room.description)}</p><div class="room-bottom"><div class="room-price"><b>${money(room.price)}</b><small>mỗi đêm · tối đa ${room.capacity} khách</small></div><span class="room-capacity">◌ ${room.capacity} khách</span></div><button class="book-room" data-book="${room.id}">Chọn phòng <span>↗</span></button></div></article>`;
}
function escapeHtml(v = '') { return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
async function loadRooms() {
  const params = new URLSearchParams({ checkIn: $('#searchCheckIn').value, checkOut: $('#searchCheckOut').value, guests: $('#searchGuests').value });
  const { rooms } = await api(`/api/rooms?${params}`); state.rooms = rooms;
  $('#roomGrid').innerHTML = rooms.length ? rooms.map(roomCard).join('') : '<div class="loading-card">Không tìm thấy phòng phù hợp trong khoảng ngày này. Hãy thử ngày khác nhé.</div>';
}
function toast(message) { const box = $('#toast'); box.textContent = message; box.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => box.classList.remove('visible'), 3600); }
$('#searchForm').addEventListener('submit', async event => { event.preventDefault(); if ($('#searchCheckOut').value <= $('#searchCheckIn').value) return toast('Ngày trả phòng cần sau ngày nhận phòng.'); try { await loadRooms(); $('#rooms').scrollIntoView({ behavior: 'smooth' }); } catch (e) { toast(e.message); } });
$('#searchCheckIn').addEventListener('change', () => { const next = new Date(`${$('#searchCheckIn').value}T12:00:00`); next.setDate(next.getDate() + 1); $('#searchCheckOut').min = isoDay(next); if ($('#searchCheckOut').value <= $('#searchCheckIn').value) $('#searchCheckOut').value = isoDay(next); });
$('#roomGrid').addEventListener('click', e => { const button = e.target.closest('[data-book]'); if (!button) return; openBooking(state.rooms.find(r => r.id === Number(button.dataset.book))); });
function openBooking(room) {
  if (!room) return; state.selectedRoom = room; $('#selectedRoom').textContent = `${room.name} · ${money(room.price)} mỗi đêm`;
  const count = $('#searchGuests').value; $('#bookingGuests').innerHTML = Array.from({ length: room.capacity }, (_, i) => `<option value="${i + 1}" ${Number(count) === i + 1 ? 'selected' : ''}>${i + 1} khách</option>`).join('');
  $('#bookingCheckIn').value = $('#searchCheckIn').value; $('#bookingCheckOut').value = $('#searchCheckOut').value; $('#bookingError').textContent = ''; $('#bookingDialog').showModal();
}
$('#bookingForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); data.roomId = state.selectedRoom.id; data.guests = Number(data.guests);
  $('#bookingError').textContent = '';
  try { const result = await api('/api/bookings', { method: 'POST', body: JSON.stringify(data) }); $('#bookingDialog').close(); event.currentTarget.reset(); toast(`Đã nhận yêu cầu #${result.bookingId}. Khách sạn sẽ sớm liên hệ với bạn.`); await loadRooms(); }
  catch (e) { $('#bookingError').textContent = e.message; }
});
$$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#bookingDialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#adminDialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#menuToggle').addEventListener('click', () => $('nav').classList.toggle('open'));
$$('nav a').forEach(a => a.addEventListener('click', () => $('nav').classList.remove('open')));
$('#adminLink').addEventListener('click', async e => { e.preventDefault(); $('#adminDialog').showModal(); await renderAdmin(); });

async function renderAdmin() {
  try { const data = await api('/api/admin/bookings'); await showAdmin(data.bookings); }
  catch (e) {
    if (e.status !== 401) return toast(e.message);
    $('#adminContent').innerHTML = `<div class="login-box"><p class="eyebrow">AN NHIÊN HOTEL · QUẢN TRỊ</p><h2>Xin chào <i>quản lý.</i></h2><p>Đăng nhập để xem yêu cầu đặt phòng và quản lý danh sách phòng.</p><form id="loginForm"><label for="adminPassword">Mật khẩu quản trị</label><input id="adminPassword" type="password" autocomplete="current-password" required placeholder="Nhập mật khẩu"><div class="dialog-error" id="loginError"></div><button class="primary-button" type="submit">Đăng nhập <span>↗</span></button></form></div>`;
    $('#loginForm').addEventListener('submit', async event => { event.preventDefault(); $('#loginError').textContent = ''; try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#adminPassword').value }) }); await renderAdmin(); } catch (err) { $('#loginError').textContent = err.message; } });
  }
}
async function showAdmin(bookings) {
  const activeTab = state.adminTab;
  $('#adminContent').innerHTML = `<div class="admin-top"><p class="eyebrow">AN NHIÊN HOTEL · QUẢN TRỊ</p><button class="small-button" id="logoutButton">Đăng xuất</button></div><h2>Quản lý <i>khách sạn.</i></h2><div class="admin-tabs"><button data-tab="bookings" class="${activeTab === 'bookings' ? 'active' : ''}">Đơn đặt phòng (${bookings.length})</button><button data-tab="rooms" class="${activeTab === 'rooms' ? 'active' : ''}">Danh sách phòng</button></div><div id="adminPane"></div>`;
  $('#logoutButton').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST', body: '{}' }); state.adminTab = 'bookings'; await renderAdmin(); });
  $$('.admin-tabs button').forEach(button => button.addEventListener('click', async () => { state.adminTab = button.dataset.tab; const current = button.dataset.tab === 'bookings' ? (await api('/api/admin/bookings')).bookings : bookings; await showAdmin(current); }));
  if (activeTab === 'bookings') renderBookings(bookings); else await renderRooms();
}
function renderBookings(bookings) {
  const pane = $('#adminPane');
  if (!bookings.length) { pane.innerHTML = '<div class="empty-state">Chưa có yêu cầu đặt phòng nào.</div>'; return; }
  pane.innerHTML = bookings.map(b => `<article class="admin-booking"><div class="admin-booking-top"><b>#${b.id} · ${escapeHtml(b.guest_name)}</b><span class="status-pill ${b.status}">${({ pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', cancelled: 'Đã hủy' })[b.status]}</span></div><p>${escapeHtml(b.room_name)} · ${b.check_in} → ${b.check_out} · ${b.guests} khách<br>${escapeHtml(b.phone)} · ${escapeHtml(b.email)}${b.note ? `<br>Ghi chú: ${escapeHtml(b.note)}` : ''}</p><div class="admin-actions">${b.status !== 'confirmed' ? `<button data-status="confirmed" data-id="${b.id}">Xác nhận</button>` : ''}${b.status !== 'cancelled' ? `<button data-status="cancelled" data-id="${b.id}">Hủy đặt</button>` : ''}</div></article>`).join('');
  pane.onclick = async e => { const btn = e.target.closest('[data-status]'); if (!btn) return; try { await api(`/api/admin/bookings/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status }) }); await renderAdmin(); } catch (err) { toast(err.message); } };
}
async function renderRooms() {
  const { rooms } = await api('/api/admin/rooms'); const pane = $('#adminPane');
  pane.innerHTML = `<button class="small-button" id="addRoomButton">+ Thêm phòng</button><div class="admin-rooms-list" style="margin-top:12px">${rooms.map(r => `<div class="admin-room-row"><span>${escapeHtml(r.name)} · ${money(r.price)} · ${r.capacity} khách ${r.active ? '' : '· Đang ẩn'}</span><button class="small-button" data-active="${r.active ? 0 : 1}" data-id="${r.id}">${r.active ? 'Ẩn phòng' : 'Hiện phòng'}</button></div>`).join('')}</div>`;
  $('#addRoomButton').addEventListener('click', showRoomForm);
  pane.onclick = async e => { const btn = e.target.closest('[data-active]'); if (!btn) return; try { await api(`/api/admin/rooms/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ active: Number(btn.dataset.active) }) }); await renderRooms(); } catch (err) { toast(err.message); } };
}
function showRoomForm() {
  const pane = $('#adminPane'); pane.innerHTML = `<h3 style="font:20px var(--serif)">Thêm phòng mới</h3><form id="newRoomForm"><div class="admin-fields"><label>Tên phòng<input name="name" required maxlength="100"></label><label>Loại phòng<input name="category" required maxlength="40" placeholder="Deluxe, Suite..."></label><label>Giá mỗi đêm (₫)<input name="price" type="number" min="1" required></label><label>Sức chứa<input name="capacity" type="number" min="1" max="20" required></label><label class="full-field">Mô tả<input name="description" required maxlength="250"></label><label class="full-field">Đường dẫn ảnh<input name="image" type="url" required placeholder="https://..."></label><label class="full-field">Nhãn<input name="tag" maxlength="40" placeholder="Được yêu thích"></label></div><div class="dialog-error" id="newRoomError"></div><button class="primary-button">Lưu phòng <span>↗</span></button></form>`;
  $('#newRoomForm').addEventListener('submit', async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); d.price = Number(d.price); d.capacity = Number(d.capacity); try { await api('/api/admin/rooms', { method: 'POST', body: JSON.stringify(d) }); state.adminTab = 'rooms'; await renderAdmin(); toast('Đã thêm phòng mới.'); } catch (err) { $('#newRoomError').textContent = err.message; } });
}
loadRooms().catch(e => { $('#roomGrid').innerHTML = `<div class="loading-card">${escapeHtml(e.message)}</div>`; });
