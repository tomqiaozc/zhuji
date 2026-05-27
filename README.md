# 筑迹 Zhuji — 装修管家 Web App

单人业主的装修全流程管家。本地优先（IndexedDB），PWA 离线可用，PC + 手机自适应。

## 技术栈

React 18 + Vite + TypeScript + Tailwind + Zustand + Dexie + Recharts + dayjs + xlsx + vite-plugin-pwa.

## 开发

```bash
cd zhuji
npm install
npm run dev      # 启动开发服务
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

## M1 范围（当前里程碑）

- 项目 CRUD（新建/编辑/删除）
- 内置十大阶段 ~60 子节点模板，每个预置避坑清单 + Checklist
- 节点工作台 4 Tab：避坑清单 / Checklist / 采购 / 备注
- 记账抽屉，含购买链接
- Dashboard：进度环、累计支出、阶段花费分布、品类饼图、最近采购
- 采购流水页：阶段/节点/品类筛选 + 搜索 + Excel 导出
- 响应式 + PWA

## 数据存储

所有数据存浏览器 IndexedDB（库名 `zhuji-db`）。M2 会接入 File System Access 做本地目录镜像。
