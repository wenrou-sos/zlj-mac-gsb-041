import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtMoney, ROOM_LABEL, STATUS_LABEL } from '../api';

export default function DepartureDetail() {
  const { id } = useParams();
  const [dep, setDep] = useState(null);
  const [tab, setTab] = useState('bookings');
  const [error, setError] = useState('');

  const load = useCallback(() => api.get(`/api/departures/${id}`).then(setDep), [id]);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!dep) return <div className="empty">加载中…</div>;

  const booked = dep.bookings.length;

  return (
    <div>
      <div className="flex">
        <div className="grow">
          <div className="page-title">
            #{dep.id} {dep.product_name}
            <span className={`badge badge-${dep.status}`} style={{ marginLeft: 10, verticalAlign: 'middle' }}>{STATUS_LABEL[dep.status]}</span>
          </div>
          <div className="page-desc">
            {dep.depart_date} 出发 · {dep.departure_city} → {dep.destination} · {dep.days}日游 · 已收 {booked}/{dep.capacity} 人
          </div>
        </div>
        <Link to="/departures"><button className="btn btn-outline">← 返回团期列表</button></Link>
      </div>

      <div className="tabs">
        <button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>👥 收客名单</button>
        <button className={tab === 'ops' ? 'active' : ''} onClick={() => setTab('ops')}>🛠 计调操作</button>
        <button className={tab === 'finance' ? 'active' : ''} onClick={() => setTab('finance')}>💰 毛利分析</button>
        <button className={tab === 'notice' ? 'active' : ''} onClick={() => setTab('notice')}>📄 出团通知书</button>
      </div>

      {tab === 'bookings' && <BookingsTab dep={dep} reload={load} />}
      {tab === 'ops' && <OpsTab dep={dep} reload={load} />}
      {tab === 'finance' && <FinanceTab id={id} />}
      {tab === 'notice' && <NoticeTab dep={dep} reload={load} />}
    </div>
  );
}

/* ---------------- 收客名单 ---------------- */
function BookingsTab({ dep, reload }) {
  const empty = { name: '', id_card: '', phone: '', room_type: 'double', special_needs: '' };
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState(null);

  const full = dep.status !== 'open';
  const priceHint = { double: dep.price_double, triple: dep.price_triple, child: dep.price_child };

  const submit = async () => {
    try {
      const r = await api.post(`/api/departures/${dep.id}/bookings`, form);
      setMsg({ ok: true, text: r.full ? '收客成功，该团已满，自动停止收客' : '收客成功' });
      setForm(empty);
      reload();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const remove = async (b) => {
    if (!confirm(`确定游客「${b.name}」退团？`)) return;
    await api.del(`/api/bookings/${b.id}`);
    reload();
  };

  return (
    <div>
      {dep.status === 'full' && <div className="alert alert-warn">⚠ 该团已满员（{dep.capacity}人），系统已自动停止收客。如有游客退团将自动恢复。</div>}
      {dep.status === 'closed' && <div className="alert alert-warn">⚠ 该团已封团，停止收客。</div>}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}

      <div className="card">
        <div className="card-title">录入游客</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="field"><label>姓名 *</label>
            <input disabled={full} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>身份证号 *</label>
            <input disabled={full} value={form.id_card} onChange={e => setForm({ ...form, id_card: e.target.value })} placeholder="18位身份证号" /></div>
          <div className="field"><label>联系方式 *</label>
            <input disabled={full} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field"><label>房型 / 价格</label>
            <select disabled={full} value={form.room_type} onChange={e => setForm({ ...form, room_type: e.target.value })}>
              {Object.entries(ROOM_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}（{fmtMoney(priceHint[k])}/人）</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>特殊需求（素食 / 轮椅 / 其他）</label>
            <input disabled={full} value={form.special_needs} onChange={e => setForm({ ...form, special_needs: e.target.value })} placeholder="如：素食、需轮椅协助" /></div>
        </div>
        <div className="form-actions">
          <button className="btn" disabled={full} onClick={submit}>{full ? '已停止收客' : '确认收客'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">游客名单（{dep.bookings.length}人）</div>
        <table>
          <thead><tr><th>姓名</th><th>身份证号</th><th>联系方式</th><th>房型</th><th>团费</th><th>特殊需求</th><th>通知书</th><th></th></tr></thead>
          <tbody>
            {dep.bookings.map(b => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>{b.id_card}</td>
                <td>{b.phone}</td>
                <td>{ROOM_LABEL[b.room_type]}</td>
                <td>{fmtMoney(b.price)}</td>
                <td>{b.special_needs ? <span className="badge badge-full">{b.special_needs}</span> : '—'}</td>
                <td>{b.notified ? <span className="badge badge-yes">已发送</span> : <span className="badge badge-no">未发送</span>}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => remove(b)}>退团</button></td>
              </tr>
            ))}
            {dep.bookings.length === 0 && <tr><td colSpan="8" className="empty">暂无游客</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 计调操作 ---------------- */
function OpsTab({ dep, reload }) {
  const [flight, setFlight] = useState({ flight_no: '', depart_date: dep.depart_date, seats: '', price: '', note: '' });
  const [hotel, setHotel] = useState({ hotel_name: '', room_type: '标准间', rooms: '', check_in: '', check_out: '', price: '' });
  const [ground, setGround] = useState({ agency: '', guide_name: '', guide_phone: '', vehicle: '', meals: '', cost: '', confirmed: false });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (dep.ground) setGround({ ...dep.ground, confirmed: !!dep.ground.confirmed });
  }, [dep.ground]);

  const toast = (text) => { setMsg({ ok: true, text }); setTimeout(() => setMsg(null), 2500); };
  const fail = (e) => setMsg({ ok: false, text: e.message });

  const addFlight = async () => {
    try {
      await api.post(`/api/departures/${dep.id}/flights`, { ...flight, seats: Number(flight.seats), price: Number(flight.price) });
      setFlight({ flight_no: '', depart_date: dep.depart_date, seats: '', price: '', note: '' });
      toast('航空切位已录入'); reload();
    } catch (e) { fail(e); }
  };
  const addHotel = async () => {
    try {
      await api.post(`/api/departures/${dep.id}/hotels`, { ...hotel, rooms: Number(hotel.rooms), price: Number(hotel.price) });
      setHotel({ hotel_name: '', room_type: '标准间', rooms: '', check_in: '', check_out: '', price: '' });
      toast('酒店控房已录入'); reload();
    } catch (e) { fail(e); }
  };
  const saveGround = async () => {
    try {
      await api.post(`/api/departures/${dep.id}/ground`, { ...ground, cost: Number(ground.cost) });
      toast('地接安排已保存'); reload();
    } catch (e) { fail(e); }
  };

  return (
    <div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}

      <div className="card">
        <div className="card-title">✈ 航空切位</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="field"><label>航班号 *</label><input value={flight.flight_no} onChange={e => setFlight({ ...flight, flight_no: e.target.value })} placeholder="如 MU5815" /></div>
          <div className="field"><label>日期</label><input type="date" value={flight.depart_date} onChange={e => setFlight({ ...flight, depart_date: e.target.value })} /></div>
          <div className="field"><label>切位座位数 *</label><input type="number" value={flight.seats} onChange={e => setFlight({ ...flight, seats: e.target.value })} /></div>
          <div className="field"><label>切位价（元/座）</label><input type="number" value={flight.price} onChange={e => setFlight({ ...flight, price: e.target.value })} /></div>
          <div className="field"><label>备注</label><input value={flight.note} onChange={e => setFlight({ ...flight, note: e.target.value })} placeholder="去程/回程" /></div>
        </div>
        <div className="form-actions"><button className="btn" onClick={addFlight}>录入切位</button></div>
        {dep.flights.length > 0 && (
          <table className="mt">
            <thead><tr><th>航班号</th><th>日期</th><th>座位数</th><th>切位价</th><th>小计</th><th>备注</th><th></th></tr></thead>
            <tbody>
              {dep.flights.map(f => (
                <tr key={f.id}>
                  <td>{f.flight_no}</td><td>{f.depart_date}</td><td>{f.seats}</td>
                  <td>{fmtMoney(f.price)}</td><td>{fmtMoney(f.seats * f.price)}</td><td>{f.note}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={async () => { await api.del(`/api/flights/${f.id}`); reload(); }}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">🏨 酒店控房</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="field"><label>酒店名称 *</label><input value={hotel.hotel_name} onChange={e => setHotel({ ...hotel, hotel_name: e.target.value })} /></div>
          <div className="field"><label>房型</label><input value={hotel.room_type} onChange={e => setHotel({ ...hotel, room_type: e.target.value })} /></div>
          <div className="field"><label>间数 *</label><input type="number" value={hotel.rooms} onChange={e => setHotel({ ...hotel, rooms: e.target.value })} /></div>
          <div className="field"><label>入住日期 *</label><input type="date" value={hotel.check_in} onChange={e => setHotel({ ...hotel, check_in: e.target.value })} /></div>
          <div className="field"><label>离店日期 *</label><input type="date" value={hotel.check_out} onChange={e => setHotel({ ...hotel, check_out: e.target.value })} /></div>
          <div className="field"><label>房价（元/间/晚）</label><input type="number" value={hotel.price} onChange={e => setHotel({ ...hotel, price: e.target.value })} /></div>
        </div>
        <div className="form-actions"><button className="btn" onClick={addHotel}>录入控房</button></div>
        {dep.hotels.length > 0 && (
          <table className="mt">
            <thead><tr><th>酒店</th><th>房型</th><th>间数</th><th>入住</th><th>离店</th><th>房价/晚</th><th></th></tr></thead>
            <tbody>
              {dep.hotels.map(h => (
                <tr key={h.id}>
                  <td>{h.hotel_name}</td><td>{h.room_type}</td><td>{h.rooms}</td>
                  <td>{h.check_in}</td><td>{h.check_out}</td><td>{fmtMoney(h.price)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={async () => { await api.del(`/api/hotels/${h.id}`); reload(); }}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">🚌 地接社确认</div>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="field"><label>地接社名称</label><input value={ground.agency} onChange={e => setGround({ ...ground, agency: e.target.value })} /></div>
          <div className="field"><label>地接导游</label><input value={ground.guide_name} onChange={e => setGround({ ...ground, guide_name: e.target.value })} /></div>
          <div className="field"><label>导游电话</label><input value={ground.guide_phone} onChange={e => setGround({ ...ground, guide_phone: e.target.value })} /></div>
          <div className="field"><label>用车安排</label><input value={ground.vehicle} onChange={e => setGround({ ...ground, vehicle: e.target.value })} placeholder="如：33座空调大巴" /></div>
          <div className="field"><label>用餐安排</label><input value={ground.meals} onChange={e => setGround({ ...ground, meals: e.target.value })} placeholder="如：7正4早，正餐40元/人" /></div>
          <div className="field"><label>地接成本（元）</label><input type="number" value={ground.cost} onChange={e => setGround({ ...ground, cost: e.target.value })} /></div>
        </div>
        <div className="flex mt">
          <label className="flex" style={{ gap: 6 }}>
            <input type="checkbox" checked={ground.confirmed} onChange={e => setGround({ ...ground, confirmed: e.target.checked })} />
            地接社已确认接待
          </label>
          <div className="grow" />
          <button className="btn" onClick={saveGround}>保存地接安排</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 毛利分析 ---------------- */
function FinanceTab({ id }) {
  const [fin, setFin] = useState(null);
  useEffect(() => { api.get(`/api/departures/${id}/finance`).then(setFin).catch(console.error); }, [id]);
  if (!fin) return <div className="empty">加载中…</div>;

  return (
    <div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card"><div className="stat-label">团总收入（{fin.headcount}人）</div><div className="stat-num">{fmtMoney(fin.revenue)}</div></div>
        <div className="stat-card"><div className="stat-label">总成本</div><div className="stat-num">{fmtMoney(fin.totalCost)}</div></div>
        <div className="stat-card"><div className="stat-label">毛利估算</div>
          <div className={`stat-num ${fin.profit >= 0 ? 'money-pos' : 'money-neg'}`}>{fmtMoney(fin.profit)}</div></div>
        <div className="stat-card"><div className="stat-label">毛利率</div>
          <div className={`stat-num ${fin.margin >= 0 ? 'money-pos' : 'money-neg'}`}>{(fin.margin * 100).toFixed(1)}%</div></div>
      </div>

      <div className="card">
        <div className="card-title">收入明细（按房型）</div>
        <table>
          <thead><tr><th>房型</th><th>人数</th></tr></thead>
          <tbody>
            <tr><td>双人房</td><td>{fin.byRoom.double || 0} 人</td></tr>
            <tr><td>三人房</td><td>{fin.byRoom.triple || 0} 人</td></tr>
            <tr><td>儿童不占床</td><td>{fin.byRoom.child || 0} 人</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">成本明细</div>
        <table>
          <thead><tr><th>项目</th><th>内容</th><th>金额</th></tr></thead>
          <tbody>
            {fin.flightItems.map(f => (
              <tr key={'f' + f.id}><td>航空切位</td><td>{f.flight_no}（{f.seats}座 × {fmtMoney(f.price)}）</td><td>{fmtMoney(f.cost)}</td></tr>
            ))}
            {fin.hotelItems.map(h => (
              <tr key={'h' + h.id}><td>酒店控房</td><td>{h.hotel_name}（{h.rooms}间 × {h.nights}晚 × {fmtMoney(h.price)}）</td><td>{fmtMoney(h.cost)}</td></tr>
            ))}
            {fin.ground && (
              <tr><td>地接费用</td><td>{fin.ground.agency}（{fin.ground.confirmed ? '已确认' : '未确认'}）</td><td>{fmtMoney(fin.groundCost)}</td></tr>
            )}
            <tr style={{ fontWeight: 700 }}>
              <td colSpan="2">成本合计</td><td>{fmtMoney(fin.totalCost)}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan="2">毛利（收入 − 成本）</td>
              <td className={fin.profit >= 0 ? 'money-pos' : 'money-neg'}>{fmtMoney(fin.profit)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 出团通知书 ---------------- */
function NoticeTab({ dep, reload }) {
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);

  const genPreview = async () => {
    const r = await api.get(`/api/departures/${dep.id}/notice`);
    setPreview(r.content);
    setResult(null);
  };

  const send = async () => {
    try {
      const r = await api.post(`/api/departures/${dep.id}/notice/send`);
      setResult(r);
      setMsg(null);
      reload();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      {msg && <div className="alert alert-error">{msg}</div>}
      <div className="card">
        <div className="card-title">
          出团通知书
          <div className="flex">
            <button className="btn btn-outline" onClick={genPreview}>生成预览</button>
            <button className="btn" onClick={send} disabled={dep.bookings.length === 0}>
              发送给全部游客（{dep.bookings.length}人）
            </button>
          </div>
        </div>
        {dep.bookings.length === 0 && <div className="alert alert-warn">该团暂无游客，请先收客。</div>}
        {preview && !result && <div className="notice-preview">{preview}</div>}
        {result && (
          <div>
            <div className="alert alert-ok">
              ✓ 通知书已于 {result.sent_at} 通过短信/微信发送给 {result.recipients.length} 位游客：
              {result.recipients.map(r => `${r.name}(${r.phone})`).join('、')}
            </div>
            <div className="notice-preview">{preview}</div>
          </div>
        )}
        {!preview && !result && <div className="empty">点击「生成预览」查看通知书内容，确认后发送给游客</div>}
      </div>

      {dep.notices.length > 0 && (
        <div className="card">
          <div className="card-title">历史发送记录</div>
          <table>
            <thead><tr><th>发送时间</th><th>接收人数</th></tr></thead>
            <tbody>
              {dep.notices.map(n => (
                <tr key={n.id}><td>{n.sent_at}</td><td>{n.recipients} 人</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
