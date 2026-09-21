/**
 * 数据库层：sql.js（SQLite 编译为 WASM，纯 JS 免原生编译）
 * 对外暴露与 better-sqlite3 类似的同步 API：prepare().run/get/all、transaction、exec
 * 每次写操作后由 index.js 的中间件调用 db.save() 持久化到 travel.db 文件
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'travel.db');

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; }
  _bind(stmt, params) {
    const p = params.map(v => v === undefined ? null : v);
    if (p.length) stmt.bind(p);
  }
  run(...params) {
    const stmt = this.db._db.prepare(this.sql);
    try { this._bind(stmt, params); stmt.step(); }
    finally { stmt.free(); }
    return {
      changes: this.db._db.getRowsModified(),
      lastInsertRowid: this.db._scalar('SELECT last_insert_rowid()'),
    };
  }
  get(...params) { return this._rows(params)[0]; }
  all(...params) { return this._rows(params); }
  _rows(params) {
    const stmt = this.db._db.prepare(this.sql);
    try {
      this._bind(stmt, params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  }
}

class DB {
  constructor(sqlDb) { this._db = sqlDb; }
  exec(sql) { this._db.exec(sql); }
  prepare(sql) { return new Stmt(this, sql); }
  _scalar(sql) {
    const r = this._db.exec(sql);
    return r.length && r[0].values.length ? r[0].values[0][0] : undefined;
  }
  transaction(fn) {
    return (...args) => {
      this._db.exec('BEGIN');
      try {
        const r = fn(...args);
        this._db.exec('COMMIT');
        return r;
      } catch (e) {
        this._db.exec('ROLLBACK');
        throw e;
      }
    };
  }
  save() {
    fs.writeFileSync(FILE, Buffer.from(this._db.export()));
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  days INTEGER NOT NULL,
  departure_city TEXT NOT NULL,
  destination TEXT NOT NULL,
  price_double REAL NOT NULL DEFAULT 0,
  price_triple REAL NOT NULL DEFAULT 0,
  price_child REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS itinerary_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  scenic TEXT DEFAULT '',
  meals TEXT DEFAULT '',
  hotel TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS departures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  depart_date TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 30,
  meeting_time TEXT DEFAULT '',
  meeting_place TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  departure_id INTEGER NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  id_card TEXT NOT NULL,
  phone TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'double',
  special_needs TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  notified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  departure_id INTEGER NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  flight_no TEXT NOT NULL,
  depart_date TEXT DEFAULT '',
  seats INTEGER NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS hotels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  departure_id INTEGER NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  hotel_name TEXT NOT NULL,
  room_type TEXT DEFAULT '标准间',
  rooms INTEGER NOT NULL DEFAULT 0,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ground (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  departure_id INTEGER NOT NULL UNIQUE REFERENCES departures(id) ON DELETE CASCADE,
  agency TEXT DEFAULT '',
  guide_name TEXT DEFAULT '',
  guide_phone TEXT DEFAULT '',
  vehicle TEXT DEFAULT '',
  meals TEXT DEFAULT '',
  cost REAL NOT NULL DEFAULT 0,
  confirmed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  departure_id INTEGER NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  recipients INTEGER DEFAULT 0,
  sent_at TEXT DEFAULT (datetime('now','localtime'))
);
`;

function seed(db) {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, days, departure_city, destination, price_double, price_triple, price_child)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insertDay = db.prepare(`
    INSERT INTO itinerary_days (product_id, day, scenic, meals, hotel) VALUES (?, ?, ?, ?, ?)`);

  const seedAll = db.transaction(() => {
    let r = insertProduct.run('云南大理丽江5日纯玩团', 5, '上海', '昆明/大理/丽江', 3680, 3480, 2280);
    const p1 = r.lastInsertRowid;
    [
      [1, '上海飞昆明，抵达后游览滇池海埂大坝、金马碧鸡坊', '晚餐（过桥米线）', '昆明 花之城豪生大酒店'],
      [2, '乘车赴大理，游洱海生态廊道骑行、喜洲古镇、白族三道茶表演', '早/中/晚（砂锅鱼）', '大理 洱海之门海景酒店'],
      [3, '大理古城、崇圣寺三塔，下午赴丽江，夜游丽江古城', '早/中/晚（纳西风味）', '丽江 和府洲际度假酒店'],
      [4, '玉龙雪山冰川公园大索道、蓝月谷、印象丽江演出', '早/中/晚', '丽江 和府洲际度假酒店'],
      [5, '束河古镇自由活动，丽江飞上海，结束愉快旅程', '早/中', '温馨的家'],
    ].forEach(d => insertDay.run(p1, ...d));

    r = insertProduct.run('北京故宫长城4日品质团', 4, '上海', '北京', 2680, 2480, 1580);
    const p2 = r.lastInsertRowid;
    [
      [1, '上海飞北京，游览天安门广场、故宫博物院', '晚餐（北京烤鸭）', '北京 王府井希尔顿酒店'],
      [2, '八达岭长城、明十三陵定陵、奥林匹克公园（鸟巢水立方外观）', '早/中/晚', '北京 王府井希尔顿酒店'],
      [3, '颐和园、天坛公园、前门大街自由活动', '早/中/晚（涮羊肉）', '北京 王府井希尔顿酒店'],
      [4, '恭王府、什刹海胡同游，北京飞上海', '早/中', '温馨的家'],
    ].forEach(d => insertDay.run(p2, ...d));

    r = insertProduct.run('三亚蜈支洲岛5日度假团', 5, '上海', '三亚', 3980, 3780, 2380);
    const p3 = r.lastInsertRowid;
    [
      [1, '上海飞三亚，入住亚龙湾海景酒店，沙滩自由活动', '晚餐（海鲜大餐）', '三亚 亚龙湾美高梅度假酒店'],
      [2, '蜈支洲岛一日游（含环岛电瓶车、潜水自选）', '早/中/晚', '三亚 亚龙湾美高梅度假酒店'],
      [3, '南山文化旅游区、天涯海角', '早/中/晚（椰子鸡）', '三亚 亚龙湾美高梅度假酒店'],
      [4, '亚龙湾热带天堂森林公园、免税店自由购物', '早/中', '三亚 亚龙湾美高梅度假酒店'],
      [5, '酒店早餐后自由活动，三亚飞上海', '早', '温馨的家'],
    ].forEach(d => insertDay.run(p3, ...d));

    // 团期
    const insertDep = db.prepare(`
      INSERT INTO departures (product_id, depart_date, capacity, meeting_time, meeting_place, status)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const d1 = insertDep.run(p1, '2026-10-01', 20, '06:30', '上海浦东机场T2航站楼出发层6号门', 'open').lastInsertRowid;
    insertDep.run(p1, '2026-10-15', 30, '07:00', '上海浦东机场T2航站楼出发层6号门', 'open');
    insertDep.run(p2, '2026-10-03', 25, '08:00', '上海虹桥机场T2航站楼P6停车场', 'open');

    // 游客
    const insertBk = db.prepare(`
      INSERT INTO bookings (departure_id, name, id_card, phone, room_type, special_needs, price)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    [
      ['张伟', '310104197505123316', '13801890001', 'double', '', 3680],
      ['李静', '310110197811023327', '13901890002', 'double', '素食', 3680],
      ['王强', '310115198203154412', '13701890003', 'double', '', 3680],
      ['赵磊', '310105199307252215', '13301890007', 'double', '', 3680],
      ['周杰', '310102197612083314', '13101890009', 'double', '', 3680],
      ['吴敏', '310113198504192227', '13001890010', 'double', '素食', 3680],
      ['郑浩', '310109198711254416', '13901890011', 'double', '', 3680],
      ['冯雪', '310114199006302228', '13801890012', 'double', '清真餐', 3680],
      ['何勇', '310107197809145512', '13701890013', 'double', '', 3680],
      ['高燕', '310116198202236624', '13601890014', 'double', '膝盖不便，行程请放慢', 3680],
      ['刘芳', '310101198509202226', '13601890004', 'triple', '', 3480],
      ['陈明', '310104198711305518', '13501890005', 'triple', '', 3480],
      ['杨丽', '310112199002186624', '13401890006', 'triple', '需轮椅协助', 3480],
      ['林芳', '310103199105174427', '13501890015', 'triple', '', 3480],
      ['孙婷', '310108199408304422', '13201890008', 'child', '儿童不占床', 2280],
      ['黄小明', '310118201608123315', '13401890016', 'child', '儿童不占床', 2280],
    ].forEach(b => insertBk.run(d1, ...b));

    // 计调：航空切位
    const insertFl = db.prepare(`
      INSERT INTO flights (departure_id, flight_no, depart_date, seats, price, note)
      VALUES (?, ?, ?, ?, ?, ?)`);
    insertFl.run(d1, 'MU5815', '2026-10-01', 18, 700, '上海浦东-昆明 去程切位');
    insertFl.run(d1, 'MU5816', '2026-10-05', 18, 750, '丽江-上海浦东 回程切位');

    // 计调：酒店控房
    const insertHo = db.prepare(`
      INSERT INTO hotels (departure_id, hotel_name, room_type, rooms, check_in, check_out, price)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertHo.run(d1, '昆明花之城豪生大酒店', '标准间', 8, '2026-10-01', '2026-10-02', 360);
    insertHo.run(d1, '大理洱海之门海景酒店', '海景标准间', 8, '2026-10-02', '2026-10-03', 480);
    insertHo.run(d1, '丽江和府洲际度假酒店', '豪华间', 8, '2026-10-03', '2026-10-05', 620);

    // 计调：地接确认
    db.prepare(`
      INSERT INTO ground (departure_id, agency, guide_name, guide_phone, vehicle, meals, cost, confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d1, '云南风光国际旅行社', '和晓燕', '13988012345', '33座空调旅游大巴 云A·L8866', '全程7正4早，正餐40元/人标准', 8800, 1);
  });
  seedAll();
  console.log('已写入种子数据');
}

async function init() {
  const SQL = await initSqlJs();
  const sqlDb = fs.existsSync(FILE)
    ? new SQL.Database(fs.readFileSync(FILE))
    : new SQL.Database();
  const db = new DB(sqlDb);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count === 0) {
    seed(db);
    db.save();
  }
  return db;
}

module.exports = init;
