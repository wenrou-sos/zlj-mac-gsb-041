import { useEffect, useState } from 'react';
import { api, fmtMoney } from '../api';

const emptyForm = {
  name: '', days: 3, departure_city: '', destination: '',
  price_double: '', price_triple: '', price_child: '', itinerary: [],
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const load = () => api.get('/api/products').then(setProducts);
  useEffect(() => { load().catch(console.error); }, []);

  // 天数变化时同步行程数组
  const setDays = (days) => {
    const n = Math.max(1, Math.min(30, Number(days) || 1));
    setForm(f => {
      const it = Array.from({ length: n }, (_, i) =>
        f.itinerary[i] || { day: i + 1, scenic: '', meals: '', hotel: '' });
      return { ...f, days: n, itinerary: it };
    });
  };

  const openForm = () => {
    setForm({ ...emptyForm, itinerary: [1, 2, 3].map(i => ({ day: i, scenic: '', meals: '', hotel: '' })) });
    setError('');
    setShowForm(true);
  };

  const setItin = (i, key, val) => {
    setForm(f => {
      const it = f.itinerary.slice();
      it[i] = { ...it[i], [key]: val };
      return { ...f, itinerary: it };
    });
  };

  const submit = async () => {
    try {
      await api.post('/api/products', {
        ...form,
        price_double: Number(form.price_double) || 0,
        price_triple: Number(form.price_triple) || 0,
        price_child: Number(form.price_child) || 0,
      });
      setShowForm(false);
      load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (p) => {
    if (!confirm(`确定删除产品「${p.name}」？其下团期与游客数据将一并删除。`)) return;
    await api.del(`/api/products/${p.id}`);
    load();
  };

  return (
    <div>
      <div className="flex">
        <div className="grow">
          <div className="page-title">产品管理</div>
          <div className="page-desc">销售部创建和维护旅游线路产品</div>
        </div>
        <button className="btn" onClick={openForm}>＋ 新建产品</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>线路名称</th><th>天数</th><th>出发城市</th><th>目的地</th><th>双人房</th><th>三人房</th><th>儿童不占床</th><th>操作</th></tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.days}天</td>
                <td>{p.departure_city}</td>
                <td>{p.destination}</td>
                <td>{fmtMoney(p.price_double)}</td>
                <td>{fmtMoney(p.price_triple)}</td>
                <td>{fmtMoney(p.price_child)}</td>
                <td className="flex">
                  <button className="btn btn-outline btn-sm" onClick={() => setViewing(p)}>行程</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>删除</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan="8" className="empty">暂无产品，点击右上角新建</td></tr>}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="modal-mask" onClick={() => setViewing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{viewing.name} · 每日行程</div>
            {viewing.itinerary.map(d => (
              <div className="itin-day" key={d.id}>
                <div className="day-tag">D{d.day}</div>
                <div>🏞 景点：{d.scenic || '—'}</div>
                <div>🍽 用餐：{d.meals || '—'}</div>
                <div>🏨 住宿：{d.hotel || '—'}</div>
              </div>
            ))}
            <div className="form-actions"><button className="btn" onClick={() => setViewing(null)}>关闭</button></div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-mask" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">新建旅游产品</div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-grid">
              <div className="field span2"><label>线路名称 *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：云南大理丽江5日纯玩团" /></div>
              <div className="field"><label>行程天数 *</label>
                <input type="number" min="1" max="30" value={form.days} onChange={e => setDays(e.target.value)} /></div>
              <div className="field"><label>出发城市 *</label>
                <input value={form.departure_city} onChange={e => setForm({ ...form, departure_city: e.target.value })} /></div>
              <div className="field span2"><label>目的地 *</label>
                <input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} placeholder="如：昆明/大理/丽江" /></div>
              <div className="field"><label>双人房价（元/人）</label>
                <input type="number" value={form.price_double} onChange={e => setForm({ ...form, price_double: e.target.value })} /></div>
              <div className="field"><label>三人房价（元/人）</label>
                <input type="number" value={form.price_triple} onChange={e => setForm({ ...form, price_triple: e.target.value })} /></div>
              <div className="field"><label>儿童不占床价（元/人）</label>
                <input type="number" value={form.price_child} onChange={e => setForm({ ...form, price_child: e.target.value })} /></div>
            </div>

            <div className="card-title mt">每日行程安排</div>
            {form.itinerary.map((d, i) => (
              <div className="itin-day" key={i}>
                <div className="day-tag">D{d.day}</div>
                <div className="form-grid">
                  <div className="field span2"><label>景点 / 活动</label>
                    <input value={d.scenic} onChange={e => setItin(i, 'scenic', e.target.value)} placeholder="当日游览景点与活动安排" /></div>
                  <div className="field"><label>用餐</label>
                    <input value={d.meals} onChange={e => setItin(i, 'meals', e.target.value)} placeholder="如：早/中/晚" /></div>
                  <div className="field"><label>住宿</label>
                    <input value={d.hotel} onChange={e => setItin(i, 'hotel', e.target.value)} placeholder="如：昆明 xx 酒店" /></div>
                </div>
              </div>
            ))}

            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn" onClick={submit}>保存产品</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
