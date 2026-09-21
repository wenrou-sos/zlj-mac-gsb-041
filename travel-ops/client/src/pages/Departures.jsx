import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, STATUS_LABEL } from '../api';

export default function Departures() {
  const [list, setList] = useState([]);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: '', depart_date: '', capacity: 30, meeting_time: '', meeting_place: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/api/departures').then(setList);
  useEffect(() => {
    load().catch(console.error);
    api.get('/api/products').then(setProducts).catch(console.error);
  }, []);

  const submit = async () => {
    try {
      await api.post('/api/departures', { ...form, capacity: Number(form.capacity) });
      setShowForm(false);
      setForm({ product_id: '', depart_date: '', capacity: 30, meeting_time: '', meeting_place: '' });
      load();
    } catch (e) { setError(e.message); }
  };

  const toggleStatus = async (d) => {
    const next = d.status === 'closed' ? 'open' : 'closed';
    await api.patch(`/api/departures/${d.id}/status`, { status: next });
    load();
  };

  return (
    <div>
      <div className="flex">
        <div className="grow">
          <div className="page-title">团期与收客</div>
          <div className="page-desc">为产品开设团期，满团自动停止收客</div>
        </div>
        <button className="btn" onClick={() => { setError(''); setShowForm(true); }}>＋ 新建团期</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>团号</th><th>线路</th><th>出发日期</th><th>出发地 → 目的地</th><th>收客进度</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            {list.map(d => (
              <tr key={d.id}>
                <td>#{d.id}</td>
                <td>{d.product_name}<div className="muted" style={{ fontSize: 12 }}>{d.days}日游</div></td>
                <td>{d.depart_date}</td>
                <td>{d.departure_city} → {d.destination}</td>
                <td>
                  <div className="flex">
                    <div className={`progress grow ${d.booked >= d.capacity ? 'full' : ''}`}>
                      <div style={{ width: Math.min(100, d.booked / d.capacity * 100) + '%' }} />
                    </div>
                    <span>{d.booked}/{d.capacity}</span>
                  </div>
                </td>
                <td><span className={`badge badge-${d.status}`}>{STATUS_LABEL[d.status]}</span></td>
                <td className="flex">
                  <Link to={`/departures/${d.id}`}><button className="btn btn-outline btn-sm">进入操作</button></Link>
                  <button className="btn btn-sm btn-danger" onClick={() => toggleStatus(d)}>
                    {d.status === 'closed' ? '重新开放' : '封团'}
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="7" className="empty">暂无团期，点击右上角新建</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-mask" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">新建团期</div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-grid">
              <div className="field span2"><label>选择产品 *</label>
                <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}>
                  <option value="">请选择线路产品</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}（{p.days}天）</option>)}
                </select>
              </div>
              <div className="field"><label>出发日期 *</label>
                <input type="date" value={form.depart_date} onChange={e => setForm({ ...form, depart_date: e.target.value })} /></div>
              <div className="field"><label>计划人数（满团上限）*</label>
                <input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
              <div className="field"><label>集合时间</label>
                <input type="time" value={form.meeting_time} onChange={e => setForm({ ...form, meeting_time: e.target.value })} /></div>
              <div className="field"><label>集合地点</label>
                <input value={form.meeting_place} onChange={e => setForm({ ...form, meeting_place: e.target.value })} placeholder="如：浦东机场T2出发层6号门" /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn" onClick={submit}>创建团期</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
