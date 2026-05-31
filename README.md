# 筑迹 Zhuji — 装修管家 Web App

> 单人业主的装修全流程管家。**本地优先**（IndexedDB），**PWA 离线可用**，PC + 手机自适应。

适合自装、半包、全包但又想自己盯紧采购和进度的业主使用。所有数据保存在你浏览器本地，**不上传任何服务器**。

## 技术栈

- **前端**：React 18 + Vite 6 + TypeScript
- **状态**：Zustand (persisted) + Dexie (IndexedDB)
- **可视化**：Recharts (饼图 / 柱图) + 自研 SVG Gantt 时间线
- **数据**：dayjs、minisearch (⌘K 搜索)、xlsx (导出)、jszip (备份)
- **PWA**：vite-plugin-pwa (Workbox) — 安装到桌面 / 离线可用
- **测试**：Playwright e2e（26 项）

## 本地开发

```bash
# 1. 克隆 & 安装
git clone https://github.com/tomqiaozc/zhuji.git
cd zhuji
npm install

# 2. 启动开发服务（http://localhost:5173）
npm run dev

# 3. 生产构建
npm run build
npm run preview          # 预览构建产物（http://localhost:4173）

# 4. 端到端测试
npm run test:e2e         # 全部 26 项
npm run test:e2e:ui      # Playwright UI 模式
```

要求：Node 18+ / 推荐 20+。Playwright 首次运行会自动安装 Chromium。

## 部署

任何静态托管都可以（Vercel / Netlify / GitHub Pages / Cloudflare Pages / 自家 nginx）：

```bash
npm run build
# 将 dist/ 整个目录上传即可
```

`vite.config.ts` 已设置 `base: './'`，所以 dist 可以放在子路径下。

PWA 安装要求：HTTPS + 有 Manifest + 有 Service Worker。本项目已自带；首次访问后浏览器会出现"安装到桌面"的提示。

## 数据备份

筑迹有 3 种数据备份方式，可叠加使用：

1. **完整 Zip 备份 / 恢复** — 设置 → "导出备份 Zip"。Zip 内含 `manifest.json` + `assets/` 原图，可一键再导入还原。**最稳妥**，建议每周一次。
2. **本地目录镜像**（Chrome / Edge）— 设置 → "选择镜像目录"。授权一个本地文件夹后，数据每次变更 2 秒内同步成 `筑迹/projects/<projectId>/data.json` + `images/`；每天还会在 `筑迹/snapshots/` 下生成一个完整 Zip（保留 30 天）。把目录放在 iCloud / OneDrive / Dropbox 里即可多端同步。
3. **PDF 装修档案** — 设置 → "生成 PDF"。浏览器打印为 PDF 即得一份可归档的项目档案（节点进度、阶段花费、采购流水）。

清空浏览器数据 / 卸载浏览器 / 换电脑前 **一定先导一份 Zip**。

## 使用手册

详见 [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — 业主向文字说明，每个功能怎么用都讲到了。

## 变更日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

MIT
