# 鲸鲸鱼 V0.2.01

基于 [Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 修改的 Windows 离线桌宠，保留原角色渲染和动画。

## 使用

完整解压 Windows 压缩包后运行 `鲸鲸鱼.exe`，不需要安装 Node.js 或填写 API Key。请保留同目录的 `resources`、DLL 和其他运行文件。

- 点击角色显示一句本地台词，待机时随机显示台词。
- 右键保留现有互动菜单，可选择离线对话、表情和动作。
- 设置只保留“习惯”和“装扮”；习惯提供走动、颜色、大小、音效和开机自动启动。
- 托盘保留打开设置、显示桌宠、开机自动启动、重新启动和退出。
- 首次启动显示鲸鱼娘；设置保存于程序旁的 `data` 目录，升级时保留自己的 `data`。
- 开启自启动后不要移动解压目录；移动后重新关闭、开启自启动。

首次待机台词约 45 秒后显示，后续随机间隔 45–70 秒。拖动、菜单、已有气泡和睡眠期间会让出台词显示。

## 源码构建

源码包包含固定版本的 `vendor/cortico`，不需要再获取子模块。安装 Node.js 22 或更新版本、pnpm 11.5.0 后运行：

```powershell
pnpm install --frozen-lockfile
pnpm run build:cortico
pnpm run typecheck
pnpm run typecheck:web
pnpm test
pnpm run build:installer -- --dir
```

`--dir` 生成 Windows 独立目录；构建安装程序时去掉 `-- --dir`。构建依赖安装需要联网，成品的本地台词不需要联网。

## 版本与授权

界面版本为 `V0.2.01`，构建版本为符合语义版本规则的 `0.2.1`。未向上游 GitHub 仓库发布。

Coopanion 提交：`2dcead0df4eb5d2b92d4a23ae154d6a4eab42cde`。
Cortico 提交：`9a1d562201413e6751a17f732d972ef19b86b466`。

保留 AGPL-3.0-or-later 授权、上游作者署名和角色素材说明。见 `LICENSE`、`packages/cortico-world-desktop-pet/THIRD_PARTY_NOTICES.md`、`docs/RELEASE-AUDIT.md`。发布运行包时请同时提供对应源码包。
