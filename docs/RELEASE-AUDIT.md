# V0.2.01 审查与发布记录

对照固定上游提交逐文件检查。

## 修改范围

- 删除角色悬停按钮，保留拖动、右键菜单和角色渲染。
- 右键菜单删除 Coo 身份和在线聊天、语音入口，加入本地台词及表情动作选择。
- 左键点击只显示一句话，连续点击不打开输入框；右键离线对话入口保留。
- 待机台词不依赖模型后台是否暂停；台词参考指定离线发布包。
- 设置只注册习惯和装扮；删除开始、语音、提示词、用量等入口及旧地址，删除左下角控制栏。
- 删除称呼和匿名统计设置项；统计上传禁用，模型事件循环暂停，不要求 API Key。
- 删除已不再调用的启动引导；构建不再生成没有入口的在线设置页面资源。
- 习惯自启动开关与托盘共用 Windows 当前用户启动项。
- 名称为鲸鲸鱼，图标使用现有鲸鱼娘素材；蓝色标题带小浪花，显示 V0.2.01。
- 首次启动使用鲸鱼娘，已有用户设置不被首次启动模板覆盖。

## 上游一致性

角色 pet-core.js、whale/figure.js、rig/rig.js、rig/canvas-rig.js、模型 JSON、贴图保持上游内容。角色侧差异集中于 pet-app.js、pet.html、pet.css 和新增的本地回复文件。

配置、窗口通信、装扮和部署加载仍依赖 Cortico 共用代码，源码包保留固定上游依赖，没有替换渲染实现。完整文件差异见 upstream-audit.json。

## 验证

- 原项目 6 个测试文件、24 项测试通过；Electron 代理测试指定已有运行时后通过。
- Node 和设置侧类型检查通过。
- 独立可执行文件首次启动通过，角色窗口连接正常，默认形象为 whale。
- 设置只显示习惯和装扮，称呼输入框与底栏不存在，旧地址返回习惯，装扮内嵌页正常加载。
- 自启动注册、取消测试通过，测试后恢复关闭；未注销或重启 Windows。
- 点击台词、待机台词、气泡关闭、拖动、菜单、离线回复、表情和跳跃回归通过。

## 清理与限制

发布包排除开发依赖、日志、个人配置、缓存、预览脚本、调试截图和旧宣传内容。源码包保留构建脚本、测试、许可证与固定版本框架源码。

原开发目录的旧文档、CI 和宣传文件未批量删除：自动审批认为删除范围过大，采用独立发布目录排除这些文件。

Windows 使用 Electron 44.5.1，与已验证预览一致。未测试 macOS、Linux，源码已上传 GitHub。


Application icon correction: pet and dress native windows use whale-icon.png; all tray variants use the existing whale artwork. Windows application identity is io.github.kiven72.jingjingyu. Native hit-testing and rendering behavior are unchanged. GitHub repository: https://github.com/kiven72/jingjingyu
