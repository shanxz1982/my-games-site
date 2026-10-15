# Shan 的小游戏站

纯静态自制小游戏门户。本地用浏览器直接打开 `index.html` 即可游玩，无需构建。

## 目录结构

```
my-games-site/
├── index.html                 # PS5 风格门户首页
├── .nojekyll                  # GitHub Pages 不走 Jekyll
├── assets/hub.css
├── games/
│   ├── time-stopper/
│   │   └── index.html         # 时间终结者
│   └── dice-football/
│       ├── index.html         # 投骰子吧！创造我的球会
│       ├── style.css
│       ├── game.js            # 经理生涯 + 存档 / CloudRecords
│       ├── story.js           # 故事模式（营救公主）
│       └── firebase-config.js # Firebase 占位（空=纯本地）
└── README.md
```

## 游戏一览

| 游戏 | 路径 | 说明 |
|------|------|------|
| 时间终结者 | `games/time-stopper/` | 计时停表技能 |
| 投骰子吧！创造我的球会 | `games/dice-football/` | 经理生涯 + **故事模式** |

### 经理生涯（Football Manager 向）

- 中超 / 中甲、掷骰比赛、转会球探、战术板、财务与收件箱
- 本地 **3 存档槽** + 档案昵称；自动/手动保存；JSON 导入导出
- 键名 `dice_football_v2`（自动迁移旧 `dice_football_save`）
- 设备殿堂纪录；`CloudRecords` → Firestore `leaderboard`（配置后启用）

### 故事模式

- 主菜单进入「故事模式 · 营救公主」
- 7 关叙事闯关：小怪 + **中段暗影骑士** + **最终魔王**
- 回合制：双方朝目标毫秒停表（类时间终结者），更接近者攻击；骰子作平局微调
- 关卡间升级（攻/防/生命）；进度存 `dice_football_story_v1`

## 本地预览

```bash
npx --yes serve .
# 或
python3 -m http.server 8080
```

## Firebase 全球排行榜（可选）

未填写配置时游戏完全离线可用。填写后，「生涯 / 经理」页可提交与拉取排行榜。

### 控制台步骤（Firebase）

1. 打开 [Firebase Console](https://console.firebase.google.com/) → **Add project**（或选已有项目）。
2. 项目内 **Build → Firestore Database → Create database**  
   - 可先选 **test mode** 便于联调，上线前务必换成下方规则。
3. **Project settings**（齿轮）→ **Your apps** → 添加 **Web** 应用，复制 SDK 配置对象。
4. 编辑本仓库文件：  
   `games/dice-football/firebase-config.js`  
   填入（前端公开配置；勿把其他私密服务账号密钥放进仓库）：

```js
window.FIREBASE_CONFIG = {
  apiKey: "粘贴",
  authDomain: "你的项目.firebaseapp.com",
  projectId: "你的项目ID",
  storageBucket: "你的项目.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
```

5. Firestore 集合 **`leaderboard`** 字段示例：  
   `managerName`, `clubName`, `trophies`, `bestFinish`, `season`, `winPct`, `nickname`, `updatedAt`
6. **Firestore → Rules**（公开读；限制创建；禁止改删）：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leaderboard/{docId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(
          ['managerName','trophies','season','winPct']
        )
        && request.resource.data.managerName is string
        && request.resource.data.managerName.size() <= 48
        && request.resource.data.trophies is int
        && request.resource.data.trophies >= 0
        && request.resource.data.trophies <= 999
        && request.resource.data.season is int
        && request.resource.data.winPct is number;
      allow update, delete: if false;
    }
  }
}
```

7. 发布规则 → 刷新游戏 → 「提交本生涯摘要」。若 `projectId` / `apiKey` 为空，则仅本地合并纪录。

适配器：`CloudRecords`（`game.js`）。Firebase 兼容 SDK 经 gstatic CDN；核心玩法不依赖 CDN。

## 部署到 GitHub Pages

1. 推送到仓库根目录（含 `.nojekyll`）。
2. **Settings → Pages** → Deploy from branch → `main` / `(root)`。
3. 地址：`https://<用户名>.github.io/<仓库名>/`

当前仓库：`https://github.com/shanxz1982/my-games-site`

## 说明

- 经理/故事存档均在浏览器 `localStorage`。
- 新增门户卡片：改 `index.html` 游戏条 + 可选 `assets/hub.css` 封面样式。
