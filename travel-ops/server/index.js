const express = require('express');
const cors = require('cors');
const path = require('path');
const initDb = require('./db');

const ROOM_PRICE_COL = { double: 'price_double', triple: 'price_triple', child: 'price_child' };

initDb().then(db => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 级联删除某团期的全部关联数据
  function deleteDepartureData(depId) {
    db.prepare('DELETE FROM bookings WHERE departure_id = ?').run(depId);
    db.prepare('DELETE FROM flights WHERE departure_id = ?').run(depId);
    db.prepare('DELETE FROM hotels WHERE departure_id = ?').run(depId);
    db.prepare('DELETE FROM ground WHERE departure_id = ?').run(depId);
    db.prepare('DELETE FROM notices WHERE departure_id = ?').run(depId);
  }

  // 写操作成功后自动持久化 SQLite 数据库文件
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.method !== 'GET' && res.statusCode < 400) db.save();
    });
    next();
  });

  // ============ 产品管理 ============

  app.get('/api/products', (req, res) => {
    const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
    const dayStmt = db.prepare('SELECT * FROM itinerary_days WHERE product_id = ? ORDER BY day');
    products.forEach(p => { p.itinerary = dayStmt.all(p.id); });
    res.json(products);
  });

  app.post('/api/products', (req, res) => {
    const { name, days, departure_city, destination, price_double, price_triple, price_child, itinerary } = req.body;
    if (!name || !days || !departure_city || !destination) {
      return res.status(400).json({ error: '线路名称、天数、出发城市、目的地为必填项' });
    }
    const tx = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO products (name, days, departure_city, destination, price_double, price_triple, price_child)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(name, days, departure_city, destination, price_double || 0, price_triple || 0, price_child || 0);
      const pid = r.lastInsertRowid;
      const ins = db.prepare('INSERT INTO itinerary_days (product_id, day, scenic, meals, hotel) VALUES (?, ?, ?, ?, ?)');
      (itinerary || []).forEach(d => ins.run(pid, d.day, d.scenic || '', d.meals || '', d.hotel || ''));
      return pid;
    });
    res.json({ id: tx() });
  });

  app.delete('/api/products/:id', (req, res) => {
    const id = req.params.id;
    const tx = db.transaction(() => {
      db.prepare('SELECT id FROM departures WHERE product_id = ?').all(id)
        .forEach(r => deleteDepartureData(r.id));
      db.prepare('DELETE FROM itinerary_days WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM departures WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    });
    tx();
    res.json({ ok: true });
  });

  // ============ 团期管理 ============

  app.get('/api/departures', (req, res) => {
    const rows = db.prepare(`
      SELECT d.*, p.name AS product_name, p.days, p.departure_city, p.destination,
        (SELECT COUNT(*) FROM bookings b WHERE b.departure_id = d.id) AS booked
      FROM departures d JOIN products p ON p.id = d.product_id
      ORDER BY d.depart_date`).all();
    res.json(rows);
  });

  app.post('/api/departures', (req, res) => {
    const { product_id, depart_date, capacity, meeting_time, meeting_place } = req.body;
    if (!product_id || !depart_date || !capacity) {
      return res.status(400).json({ error: '产品、出发日期、计划人数为必填项' });
    }
    const r = db.prepare(`
      INSERT INTO departures (product_id, depart_date, capacity, meeting_time, meeting_place)
      VALUES (?, ?, ?, ?, ?)`)
      .run(product_id, depart_date, capacity, meeting_time || '', meeting_place || '');
    res.json({ id: r.lastInsertRowid });
  });

  app.patch('/api/departures/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: '非法状态' });
    db.prepare('UPDATE departures SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
  });

  // 删除团期（级联删除游客、计调、通知书记录）
  app.delete('/api/departures/:id', (req, res) => {
    const tx = db.transaction(() => {
      deleteDepartureData(req.params.id);
      db.prepare('DELETE FROM departures WHERE id = ?').run(req.params.id);
    });
    tx();
    res.json({ ok: true });
  });

  app.get('/api/departures/:id', (req, res) => {
    const dep = db.prepare(`
      SELECT d.*, p.name AS product_name, p.days, p.departure_city, p.destination,
             p.price_double, p.price_triple, p.price_child
      FROM departures d JOIN products p ON p.id = d.product_id WHERE d.id = ?`).get(req.params.id);
    if (!dep) return res.status(404).json({ error: '团期不存在' });
    dep.itinerary = db.prepare('SELECT * FROM itinerary_days WHERE product_id = ? ORDER BY day').all(dep.product_id);
    dep.bookings = db.prepare('SELECT * FROM bookings WHERE departure_id = ? ORDER BY id').all(dep.id);
    dep.flights = db.prepare('SELECT * FROM flights WHERE departure_id = ? ORDER BY id').all(dep.id);
    dep.hotels = db.prepare('SELECT * FROM hotels WHERE departure_id = ? ORDER BY id').all(dep.id);
    dep.ground = db.prepare('SELECT * FROM ground WHERE departure_id = ?').get(dep.id) || null;
    dep.notices = db.prepare('SELECT * FROM notices WHERE departure_id = ? ORDER BY id DESC').all(dep.id);
    res.json(dep);
  });

  // ============ 收客 ============

  // 录入游客（满团自动停止收客）
  app.post('/api/departures/:id/bookings', (req, res) => {
    const dep = db.prepare('SELECT * FROM departures WHERE id = ?').get(req.params.id);
    if (!dep) return res.status(404).json({ error: '团期不存在' });
    if (dep.status === 'closed') return res.status(409).json({ error: '该团已封团，停止收客' });
    if (dep.status === 'full') return res.status(409).json({ error: '该团已满，停止收客' });

    const { name, id_card, phone, room_type, special_needs } = req.body;
    if (!name || !id_card || !phone) return res.status(400).json({ error: '姓名、身份证号、联系方式为必填项' });
    if (!/^\d{17}[\dXx]$/.test(id_card)) return res.status(400).json({ error: '身份证号格式不正确（18位）' });
    const rt = ROOM_PRICE_COL[room_type] ? room_type : 'double';

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(dep.product_id);
    const price = product[ROOM_PRICE_COL[rt]];

    const tx = db.transaction(() => {
      const booked = db.prepare('SELECT COUNT(*) AS c FROM bookings WHERE departure_id = ?').get(dep.id).c;
      if (booked >= dep.capacity) {
        db.prepare("UPDATE departures SET status = 'full' WHERE id = ?").run(dep.id);
        throw Object.assign(new Error('该团已满，停止收客'), { code: 409 });
      }
      const r = db.prepare(`
        INSERT INTO bookings (departure_id, name, id_card, phone, room_type, special_needs, price)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(dep.id, name, id_card, phone, rt, special_needs || '', price);
      const now = booked + 1;
      if (now >= dep.capacity) {
        db.prepare("UPDATE departures SET status = 'full' WHERE id = ?").run(dep.id);
      }
      return { id: r.lastInsertRowid, booked: now, full: now >= dep.capacity };
    });
    try {
      res.json(tx());
    } catch (e) {
      res.status(e.code || 500).json({ error: e.message });
    }
  });

  // 游客退团，删除后若未满自动恢复收客
  app.delete('/api/bookings/:id', (req, res) => {
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!bk) return res.status(404).json({ error: '游客不存在' });
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM bookings WHERE id = ?').run(bk.id);
      const dep = db.prepare('SELECT * FROM departures WHERE id = ?').get(bk.departure_id);
      const booked = db.prepare('SELECT COUNT(*) AS c FROM bookings WHERE departure_id = ?').get(bk.departure_id).c;
      if (dep.status === 'full' && booked < dep.capacity) {
        db.prepare("UPDATE departures SET status = 'open' WHERE id = ?").run(dep.id);
      }
    });
    tx();
    res.json({ ok: true });
  });

  // ============ 计调操作 ============

  // 航空切位
  app.post('/api/departures/:id/flights', (req, res) => {
    const { flight_no, depart_date, seats, price, note } = req.body;
    if (!flight_no || !seats) return res.status(400).json({ error: '航班号、座位数为必填项' });
    const r = db.prepare('INSERT INTO flights (departure_id, flight_no, depart_date, seats, price, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, flight_no, depart_date || '', seats, price || 0, note || '');
    res.json({ id: r.lastInsertRowid });
  });
  app.delete('/api/flights/:id', (req, res) => {
    db.prepare('DELETE FROM flights WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 酒店控房
  app.post('/api/departures/:id/hotels', (req, res) => {
    const { hotel_name, room_type, rooms, check_in, check_out, price } = req.body;
    if (!hotel_name || !rooms || !check_in || !check_out) {
      return res.status(400).json({ error: '酒店名称、间数、入住/离店日期为必填项' });
    }
    const r = db.prepare(`
      INSERT INTO hotels (departure_id, hotel_name, room_type, rooms, check_in, check_out, price)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(req.params.id, hotel_name, room_type || '标准间', rooms, check_in, check_out, price || 0);
    res.json({ id: r.lastInsertRowid });
  });
  app.delete('/api/hotels/:id', (req, res) => {
    db.prepare('DELETE FROM hotels WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // 地接社确认（每团一条，重复提交则更新）
  app.post('/api/departures/:id/ground', (req, res) => {
    const { agency, guide_name, guide_phone, vehicle, meals, cost, confirmed } = req.body;
    db.prepare(`
      INSERT INTO ground (departure_id, agency, guide_name, guide_phone, vehicle, meals, cost, confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(departure_id) DO UPDATE SET
        agency = excluded.agency, guide_name = excluded.guide_name, guide_phone = excluded.guide_phone,
        vehicle = excluded.vehicle, meals = excluded.meals, cost = excluded.cost, confirmed = excluded.confirmed`)
      .run(req.params.id, agency || '', guide_name || '', guide_phone || '', vehicle || '', meals || '', cost || 0, confirmed ? 1 : 0);
    res.json({ ok: true });
  });

  // ============ 毛利分析 ============

  app.get('/api/departures/:id/finance', (req, res) => {
    const dep = db.prepare(`
      SELECT d.*, p.name AS product_name FROM departures d
      JOIN products p ON p.id = d.product_id WHERE d.id = ?`).get(req.params.id);
    if (!dep) return res.status(404).json({ error: '团期不存在' });

    const bookings = db.prepare('SELECT * FROM bookings WHERE departure_id = ?').all(dep.id);
    const flights = db.prepare('SELECT * FROM flights WHERE departure_id = ?').all(dep.id);
    const hotels = db.prepare('SELECT * FROM hotels WHERE departure_id = ?').all(dep.id);
    const ground = db.prepare('SELECT * FROM ground WHERE departure_id = ?').get(dep.id);

    const revenue = bookings.reduce((s, b) => s + b.price, 0);
    const byRoom = { double: 0, triple: 0, child: 0 };
    bookings.forEach(b => { byRoom[b.room_type] = (byRoom[b.room_type] || 0) + 1; });

    const flightItems = flights.map(f => ({ ...f, cost: f.seats * f.price }));
    const flightCost = flightItems.reduce((s, f) => s + f.cost, 0);

    const hotelItems = hotels.map(h => {
      const nights = Math.max(0, Math.round((new Date(h.check_out) - new Date(h.check_in)) / 86400000));
      return { ...h, nights, cost: h.rooms * nights * h.price };
    });
    const hotelCost = hotelItems.reduce((s, h) => s + h.cost, 0);

    const groundCost = ground ? ground.cost : 0;
    const totalCost = flightCost + hotelCost + groundCost;
    const profit = revenue - totalCost;

    res.json({
      departure: dep,
      headcount: bookings.length,
      byRoom,
      revenue,
      flightItems, flightCost,
      hotelItems, hotelCost,
      ground, groundCost,
      totalCost, profit,
      margin: revenue > 0 ? profit / revenue : 0,
    });
  });

  // ============ 出团通知书 ============

  function buildNotice(dep) {
    const itinerary = db.prepare('SELECT * FROM itinerary_days WHERE product_id = ? ORDER BY day').all(dep.product_id);
    const flights = db.prepare('SELECT * FROM flights WHERE departure_id = ? ORDER BY depart_date, id').all(dep.id);
    const hotels = db.prepare('SELECT * FROM hotels WHERE departure_id = ? ORDER BY check_in').all(dep.id);
    const ground = db.prepare('SELECT * FROM ground WHERE departure_id = ?').get(dep.id);

    const lines = [];
    lines.push('════════ 出 团 通 知 书 ════════');
    lines.push('');
    lines.push('尊敬的游客：');
    lines.push(`　　您好！感谢您报名参加我社组织的「${dep.product_name}」。现将出团有关事项通知如下：`);
    lines.push('');
    lines.push(`一、集合时间：${dep.depart_date} ${dep.meeting_time || '另行通知'}`);
    lines.push(`二、集合地点：${dep.meeting_place || '另行通知'}`);
    lines.push('');
    if (flights.length) {
      lines.push('三、航班信息：');
      flights.forEach(f => lines.push(`　　${f.depart_date || dep.depart_date}　${f.flight_no}${f.note ? '（' + f.note + '）' : ''}`));
      lines.push('');
    }
    if (hotels.length) {
      lines.push('四、住宿安排：');
      hotels.forEach(h => lines.push(`　　${h.check_in} 至 ${h.check_out}　${h.hotel_name}（${h.room_type}）`));
      lines.push('');
    }
    lines.push('五、行程概览：');
    itinerary.forEach(d => {
      lines.push(`　　D${d.day}　${d.scenic}`);
      lines.push(`　　　　用餐：${d.meals || '自理'}　住宿：${d.hotel || '—'}`);
    });
    lines.push('');
    if (ground && ground.confirmed) {
      lines.push('六、地接安排：');
      lines.push(`　　地接社：${ground.agency}`);
      lines.push(`　　导游：${ground.guide_name}　联系电话：${ground.guide_phone}`);
      lines.push(`　　用车：${ground.vehicle}`);
      lines.push('');
    }
    lines.push('七、温馨提示：');
    lines.push('　　1. 请携带本人有效身份证件原件，儿童请携带户口簿；');
    lines.push('　　2. 请提前2小时到达机场办理登机手续；');
    lines.push('　　3. 如有特殊需求（餐饮禁忌、行动不便等），我社已做相应安排，请放心出行；');
    lines.push('　　4. 行程中请听从导游安排，注意人身及财物安全。');
    lines.push('');
    lines.push('　　祝您旅途愉快！');
    lines.push('');
    lines.push('　　　　　　　　　　　　　　　　旅行社计调部');
    lines.push(`　　　　　　　　　　　　　　　　${new Date().toLocaleDateString('zh-CN')}`);
    return lines.join('\n');
  }

  // 预览通知书
  app.get('/api/departures/:id/notice', (req, res) => {
    const dep = db.prepare(`
      SELECT d.*, p.name AS product_name FROM departures d
      JOIN products p ON p.id = d.product_id WHERE d.id = ?`).get(req.params.id);
    if (!dep) return res.status(404).json({ error: '团期不存在' });
    res.json({ content: buildNotice(dep) });
  });

  // 生成并发送给全部游客（模拟短信/微信发送）
  app.post('/api/departures/:id/notice/send', (req, res) => {
    const dep = db.prepare(`
      SELECT d.*, p.name AS product_name FROM departures d
      JOIN products p ON p.id = d.product_id WHERE d.id = ?`).get(req.params.id);
    if (!dep) return res.status(404).json({ error: '团期不存在' });
    const bookings = db.prepare('SELECT * FROM bookings WHERE departure_id = ?').all(dep.id);
    if (bookings.length === 0) return res.status(400).json({ error: '该团暂无游客，无法发送' });

    const content = buildNotice(dep);
    const tx = db.transaction(() => {
      const r = db.prepare('INSERT INTO notices (departure_id, content, recipients) VALUES (?, ?, ?)')
        .run(dep.id, content, bookings.length);
      db.prepare('UPDATE bookings SET notified = 1 WHERE departure_id = ?').run(dep.id);
      return r.lastInsertRowid;
    });
    const id = tx();
    res.json({
      id,
      recipients: bookings.map(b => ({ name: b.name, phone: b.phone })),
      sent_at: db.prepare('SELECT sent_at FROM notices WHERE id = ?').get(id).sent_at,
    });
  });

  // ============ 概览统计 ============

  app.get('/api/stats', (req, res) => {
    const products = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    const departures = db.prepare('SELECT COUNT(*) AS c FROM departures').get().c;
    const tourists = db.prepare('SELECT COUNT(*) AS c FROM bookings').get().c;
    const revenue = db.prepare('SELECT COALESCE(SUM(price),0) AS s FROM bookings').get().s;
    const upcoming = db.prepare(`
      SELECT d.id, d.depart_date, d.capacity, d.status, p.name AS product_name,
        (SELECT COUNT(*) FROM bookings b WHERE b.departure_id = d.id) AS booked
      FROM departures d JOIN products p ON p.id = d.product_id
      WHERE d.depart_date >= date('now') ORDER BY d.depart_date LIMIT 5`).all();
    res.json({ products, departures, tourists, revenue, upcoming });
  });

  // 生产模式：托管前端构建产物
  const dist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'), err => { if (err) next(); });
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`服务已启动: http://localhost:${PORT}`));
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
