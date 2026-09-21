const base = '';

async function request(path, options = {}) {
  const res = await fetch(base + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body) }),
  patch: (p, body) => request(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (p) => request(p, { method: 'DELETE' }),
};

export const ROOM_LABEL = { double: '双人房', triple: '三人房', child: '儿童不占床' };
export const STATUS_LABEL = { open: '收客中', full: '已满团', closed: '已封团' };
export const fmtMoney = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN', { minimumFraction: 0 });
