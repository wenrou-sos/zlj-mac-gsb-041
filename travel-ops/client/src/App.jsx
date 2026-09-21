import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Departures from './pages/Departures';
import DepartureDetail from './pages/DepartureDetail';

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">✈</span>
          <div>
            <div className="logo-title">旅行社ERP</div>
            <div className="logo-sub">组团 · 计调操作平台</div>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>📊 工作台</NavLink>
          <NavLink to="/products">🗺 产品管理</NavLink>
          <NavLink to="/departures">👥 团期与收客</NavLink>
        </nav>
        <div className="sidebar-foot">销售 · 计调 · 财务一体化</div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/departures" element={<Departures />} />
          <Route path="/departures/:id" element={<DepartureDetail />} />
        </Routes>
      </main>
    </div>
  );
}
