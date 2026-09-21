import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney, STATUS_LABEL } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get('/api/stats').then(setStats).catch(console.error); }, []);

  if (!stats) return <div className="empty">加载中…</div>;

  return (
    <div>
      <div className="page-title">工作台</div>
      <div className="page-desc">旅行社组团与计调业务概览</div>

      <div className="stats">
        <div className="stat-card"><div className="stat-label">在售旅游产品</div><div className="stat-num">{stats.products}</div></div>
        <div className="stat-card"><div className="stat-label">团期总数</div><div className="stat-num">{stats.departures}</div></div>
        <div className="stat-card"><div className="stat-label">已收游客</div><div className="stat-num">{stats.tourists}</div></div>
        <div className="stat-card"><div className="stat-label">收客总金额</div><div className="stat-num">{fmtMoney(stats.revenue)}</div></div>
      </div>

      <div className="card">
        <div className="card-title">近期出团</div>
        {stats.upcoming.length === 0 ? <div className="empty">暂无待出团计划</div> : (
          <table>
            <thead><tr><th>出发日期</th><th>线路</th><th>收客进度</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {stats.upcoming.map(d => (
                <tr key={d.id}>
                  <td>{d.depart_date}</td>
                  <td>{d.product_name}</td>
                  <td>
                    <div className="flex">
                      <div className={`progress grow ${d.booked >= d.capacity ? 'full' : ''}`}>
                        <div style={{ width: Math.min(100, d.booked / d.capacity * 100) + '%' }} />
                      </div>
                      <span>{d.booked}/{d.capacity}</span>
                    </div>
                  </td>
                  <td><span className={`badge badge-${d.status}`}>{STATUS_LABEL[d.status]}</span></td>
                  <td><Link to={`/departures/${d.id}`}><button className="btn btn-outline btn-sm">进入操作</button></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
