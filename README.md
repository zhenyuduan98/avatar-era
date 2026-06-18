# 🤖 Avatar 纪元 - AI 数字人对话平台

基于 Azure AI Speech + Azure OpenAI 构建的实时 AI 数字人交互平台，支持语音对话、实时表情、多语言切换。

## ✨ 功能特性

- 🎭 **实时数字人** - Azure Speech Avatar WebRTC 实时渲染
- 🗣️ **语音对话** - 支持语音输入 + TTS 语音输出
- 💬 **智能对话** - GPT-4o 驱动的自然语言交互
- 🌐 **多语言** - 支持普通话 & 粤语版本
- 🎨 **现代 UI** - Material Design 风格，响应式布局
- 📡 **流式响应** - SSE 实时流式输出，体验流畅

## 🛠️ 技术栈

| 组件 | 技术 |
|------|------|
| AI 数字人 | Azure AI Speech Avatar (WebRTC) |
| 语音识别 | Azure Speech SDK (STT) |
| 语音合成 | Azure Speech SDK (TTS) |
| 大语言模型 | Azure OpenAI GPT-4o |
| 代理服务 | Node.js HTTP Proxy (GitHub Copilot API) |
| 静态服务 | Node.js HTTP Server |
| 前端 | 原生 HTML/CSS/JS + Material Icons |
| 部署 | PM2 进程管理 |

## 📁 项目结构

```
├── CantoneseAvatar.html   # 粤语版数字人页面
├── chat.html              # 普通话版数字人页面
├── js/
│   └── chat.js           # 核心交互逻辑
├── css/
│   └── style.css         # 样式文件
├── image/                 # 静态资源
├── proxy.js              # Copilot API 代理服务
├── server.js             # 静态文件服务器
└── README.md
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- Azure Speech 服务密钥
- Azure OpenAI 服务密钥

### 配置

在 `chat.html` 和 `CantoneseAvatar.html` 中填入你的 Azure 密钥：

```javascript
const CONFIG = {
  speechKey: 'YOUR_AZURE_SPEECH_KEY',
  speechRegion: 'eastasia',         // 你的 Azure 区域
  openaiKey: 'YOUR_AZURE_OPENAI_KEY',
  openaiEndpoint: 'https://your-resource.openai.azure.com',
};
```

### 启动

```bash
# 启动静态服务器 (端口 8080)
node server.js

# 启动 API 代理 (端口 5050，可选)
node proxy.js
```

访问 http://localhost:8080/chat.html 开始对话。

### 使用 PM2 部署

```bash
pm2 start server.js --name avatar-static
pm2 start proxy.js --name avatar-proxy
pm2 save
```

## 🔐 安全说明

⚠️ **不要将 API 密钥提交到 Git！**

本项目使用占位符 (`YOUR_AZURE_SPEECH_KEY` / `YOUR_AZURE_OPENAI_KEY`)，部署时请替换为真实密钥。

生产环境建议通过环境变量或后端代理注入密钥，避免前端暴露。

## 🎯 演示

- 普通话版: `/chat.html`
- 粤语版: `/CantoneseAvatar.html`

## 📄 许可证

MIT License

## 👤 作者

[@zhenyuduan98](https://github.com/zhenyuduan98)
