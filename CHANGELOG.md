# Changelog

所有重要变更按里程碑（Milestone）记录。日期为 commit landing 日期。

## M3 — 模板 / 相册 / 性能 / 体验完善（2026-05-31）

**Commit:** `23a81bf`

- **模板管理** — 设置 → 节点模板管理：可视化编辑默认阶段 / 节点 / 预置 tips / checklist，「恢复出厂模板」一键还原。模板变更只影响新建项目。
- **图片相册 + 灯箱** — 节点图片 Tab 统一展示节点 + 采购图；`ImageLightbox` 支持键盘 ←/→/Esc/+/-/0 + 移动端单指滑动 / 双指捏合（1-4x）/ 双击切换 1x ↔ 2x。上传时 `compressImage` 长边 ≤1920px、JPEG q=0.85（PNG 保留透明度）。
- **Dashboard 完善** — 阶段花费分布条点击跳转 + 自动筛选采购流水；新增「Top 5 高价采购」卡片；新增「采购时间趋势」（按周 / 月）柱图；品类饼图 Tooltip 显示金额。
- **性能** — IntersectionObserver 懒加载缩略图（`LazyImage`）；vite `manualChunks` 拆 recharts / xlsx / dexie；xlsx 改为 export 时动态 import。**主 bundle 从 1.1 MB 降到 167 KB（gzip 57.6 KB）**。
- **空状态 + 引导** — 首次无项目显示居中欢迎卡（新建 / 加载示例）；NodeWorkspace 4 步浮层引导（localStorage 标记仅显示一次）。
- **辅助必需** — React `ErrorBoundary` 包裹主视图；全局 toast bus（成功 / 失败）；键盘快捷键帮助（`?`）；`⌘N` 打开记一笔；`Esc` 关闭 Drawer / KeyboardHelp / Lightbox。
- **测试** — 新增 M3 e2e 8 项，全套 26/26 全绿。

## M2 — 提醒 / 时间线 / 备份 / 协作（2026-05-29 → 2026-05-31）

**Commits:** `ee8ab9f` · `ad4d9c2` · `6a008a9`

- **提醒系统** — 节点 / 采购 / 自定义提醒，支持原生 Notification + 应用内 toast 双通道。
- **Timeline / Gantt 视图** — 自研 SVG，按阶段分组显示，**支持拖拽节点条调整计划日期**。
- **⌘K 全局搜索** — MiniSearch 索引节点 / 采购 / 提醒，键盘上下选择、回车跳转。
- **本地目录镜像**（Chrome / Edge File System Access API）— 选择本机目录后，数据变更 2 秒内同步成 `筑迹/projects/<projectId>/data.json` + `images/`；每天生成 `筑迹/snapshots/<date>.zip` 完整快照，保留 30 天。非 FSA 浏览器降级为下载快照 Zip 按钮。
- **完整 Zip 备份 / 恢复** — manifest.json + 原图打包，可一键再导入还原。
- **PDF 装修档案** — 浏览器新窗口打开可打印的项目档案（节点进度、阶段花费、采购流水）。
- **节点富文本备注** — `contenteditable` 富文本编辑器，写入前 `sanitizeHtml` 严格清洗（仅保留白名单标签 + `target=_blank rel=noreferrer noopener`）。
- **节点照片** — 支持多图上传、删除；级联：删除节点 / 采购时连带删除 assets。
- **测试** — 11 项 M2 e2e（含拖拽 Gantt、级联删除、Excel 导出、FSA 降级、PDF 弹窗、备份 round-trip）。

## M1 — 核心数据模型 + 基础视图（2026-05-27 → 2026-05-28）

**Commits:** `ee8ab9f` 之前

- **项目 CRUD** — 项目切换器、新建 / 编辑 / 删除 + 多确认。
- **节点模板** — 内置 11 个阶段、约 60 个子节点，每个预置避坑要点 + Checklist。
- **节点工作台** — 5 Tab：避坑要点 / Checklist / 采购 / 图片 / 备注。状态机：未开始 → 进行中 → 已完成 / 已跳过。
- **记账抽屉** — 名称 / 规格 / 品牌 / 渠道 / 单价 × 数量 = 总价 / 购买链接 / 图片，挂到节点上。
- **Dashboard** — 进度环、累计支出、本周采购、当前进行中、各阶段花费分布、品类饼图、最近采购。
- **采购流水** — 阶段 / 节点 / 品类筛选 + 关键字搜索 + Excel 导出。
- **示例项目** — 一键加载"89 ㎡ 毛坯，~30 笔采购，进度过半"的演示项目，零数据时也能体验全部功能。
- **PWA** — Workbox 离线缓存 + manifest，可装到桌面。
- **测试** — 7 项基线 e2e。
