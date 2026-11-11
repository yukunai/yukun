# yukun

macOS 悬浮面板，用快捷键和提示词按钮控制本地 AI 编程工具。

## 安装

需要 macOS、Node.js、Rust、Xcode Command Line Tools。tmux 模式还需要 tmux。

克隆仓库后，在项目根目录执行以下步骤。

```sh
npm ci
npm run tauri dev
```

## 使用

打开设置，添加 Codex CLI 或 Claude Code 目标。输入对应的 tmux 会话名，选择提示词并发送。浏览器预览可以运行 npm run dev。

## 检查

```sh
npm run build
```

## 说明

仓库包含源码与启动所需的示例。模型、平台或推送服务的凭据由使用者在本机配置。
