# Shan 的小游戏站

纯静态自制小游戏门户。本地用浏览器直接打开 `index.html` 即可游玩，无需构建。

## 目录结构

```
my-games-site/
├── index.html              # 门户首页
├── assets/hub.css          # 首页样式
├── games/
│   └── time-stopper/
│       └── index.html      # 时间终结者 TIME STOPPER
└── README.md
```

## 本地预览

- 双击或用浏览器打开 `index.html`
- 或在本目录启动静态服务，例如：

```bash
npx --yes serve .
# 或
python3 -m http.server 8080
```

然后访问提示的地址，点击「开始游玩」进入游戏。

## 部署到 GitHub Pages

1. 新建 GitHub 仓库，将本文件夹内容推上去（仓库根目录即为站点根目录，含 `index.html`）。
2. 仓库 **Settings → Pages**：
   - Source 选 **Deploy from a branch**
   - Branch 选 `main`（或 `master`），文件夹选 `/ (root)`
3. 保存后稍等片刻，站点地址形如：`https://<用户名>.github.io/<仓库名>/`

也可用拖拽：把整个 `my-games-site` 文件夹内容放进仓库根目录后 push。

若希望站点挂在用户主页（`https://<用户名>.github.io/`），把文件推到名为 `<用户名>.github.io` 的仓库根目录即可。

## 部署到 Cloudflare Pages

**方式 A — 拖拽上传**

1. 打开 [Cloudflare Pages](https://pages.cloudflare.com/) → Create project → **Upload assets**
2. 将整个 `my-games-site` 文件夹拖入（或先打成 zip 再上传）
3. 部署完成后即可访问分配的 `*.pages.dev` 域名

**方式 B — Git 连接**

1. 把本仓库推到 GitHub / GitLab
2. Cloudflare Pages → Create project → Connect to Git
3. 构建设置：
   - Framework preset: **None**
   - Build command: 留空
   - Build output directory: `/`（或仓库根目录）
4. Save and Deploy

## 说明

- 核心资源不依赖 CDN；游戏为单文件 HTML，自包含。
- 新增游戏：在 `games/<游戏名>/` 下放入 `index.html`，并在门户 `index.html` 增加一张卡片即可。
