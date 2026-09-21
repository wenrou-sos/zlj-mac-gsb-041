# 旅行社组团与计调操作平台

React + Express + SQLite（sql.js，WASM 版 SQLite，无需原生编译）的全栈应用。

## 功能模块

| 模块 | 说明 |
|------|------|
| 工作台 | 产品/团期/游客/收客总额概览，近期出团列表 |
| 产品管理 | 销售部创建线路：名称、天数、出发城市、目的地、每日行程（景点/用餐/住宿）、三档价格（双人房/三人房/儿童不占床） |
| 团期与收客 | 开设团期（出发日期、计划人数、集合时间地点）；录入游客（姓名/身份证/电话/特殊需求），**满团自动停止收客**，退团后自动恢复 |
| 计调操作 | 航空切位（航班号/座位数/切位价）、酒店控房（房型/间数/入住离店日期）、地接社确认（导游/用车/用餐/成本） |
| 毛利分析 | 团总收入 vs 机票/酒店/地接各项成本，自动计算毛利与毛利率 |
| 出团通知书 | 按团期自动生成通知书（集合信息/航班/酒店/行程/地接/温馨提示），一键"发送"给全部游客（模拟短信/微信），记录发送历史 |

## 快速开始

```bash
# 安装依赖
npm run install:all

# 开发模式（终端1：后端 :3001，终端2：前端 :5173，已配置代理）
npm run dev:server
npm run dev:client

# 生产模式（构建前端后由后端统一托管）
npm run build
npm start          # http://localhost:3001
```

首次启动自动建表并写入演示数据（3条线路、3个团期、8名游客、完整计调数据）。
数据库文件为 `server/travel.db`，删除后重启即可重置演示数据。

## 目录结构

```
server/
  index.js   # Express API（产品/团期/收客/计调/毛利/通知书）
  db.js      # SQLite 初始化、建表、种子数据（sql.js 同步API包装）
client/
  src/pages/ # Dashboard / Products / Departures / DepartureDetail(收客·计调·毛利·通知书)
```

## 主要 API

- `GET/POST/DELETE /api/products` 产品管理
- `GET/POST /api/departures`，`PATCH /api/departures/:id/status` 封团/开放
- `POST /api/departures/:id/bookings` 收客（满团返回 409）
- `POST /api/departures/:id/flights|hotels|ground` 计调录入
- `GET /api/departures/:id/finance` 毛利分析
- `GET /api/departures/:id/notice` 预览通知书，`POST .../notice/send` 发送
