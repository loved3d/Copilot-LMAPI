# Copilot-LMAPI

一个 VS Code 扩展，将 GitHub Copilot 的语言模型 API 桥接到兼容 OpenAI 和 Anthropic Claude 的 HTTP 接口，让你能够通过标准的 OpenAI 客户端库或 Claude Code CLI 来使用 Copilot 模型。

## 🚀 主要功能

- **OpenAI 兼容 API**：完全兼容 OpenAI Chat Completions API
- **Claude Code 兼容 API**：支持 Anthropic Messages API 格式，可直接与 Claude Code CLI 集成
- **动态模型发现**：实时发现所有可用的 Copilot 模型，无硬编码限制
- **双模型路由**：Claude Code 模式支持 background/thinking 模型路由
- **多模态支持**：支持文本和图像输入，自动处理 Base64、URL 和本地文件
- **函数/工具调用**：完整支持 OpenAI 函数调用规范
- **智能模型选择**：根据请求需求自动选择最优模型
- **流式响应支持**：通过 Server-Sent Events 实现实时流式响应
- **本地服务器**：在本地运行，保护隐私和安全
- **实时监控**：状态栏集成和详细日志记录

## 🛠️ 安装方法

### 方法一：从 VSIX 文件安装（推荐）

1. 构建或下载最新的 `.vsix` 文件：
   ```bash
   # 克隆仓库
   git clone https://github.com/loved3d/Copilot-LMAPI.git
   cd Copilot-LMAPI
   
   # 安装依赖
   npm ci
   
   # 构建并打包
   npm run package
   ```

2. 安装扩展：
   ```bash
   code --install-extension copilot-lmapi-bridge-0.3.2.vsix
   ```

3. 或通过 VS Code UI：
   - 打开 VS Code
   - 进入扩展视图（`Ctrl+Shift+X`）
   - 点击 "..." → "从 VSIX 安装..."
   - 选择 `copilot-lmapi-bridge-0.3.2.vsix` 文件

## 🔧 配置设置

通过 VS Code 设置来配置扩展：

```json
{
    "copilot-lmapi.port": 8001,
    "copilot-lmapi.host": "127.0.0.1",
    "copilot-lmapi.autoStart": false,
    "copilot-lmapi.enableLogging": true,
    "copilot-lmapi.maxConcurrentRequests": 10,
    "copilot-lmapi.requestTimeout": 120000,
    "copilot-lmapi.modelCacheRefreshInterval": 300000,
    "copilot-lmapi.modelHealthCheckInterval": 600000,
    "copilot-lmapi.claudeCode.backgroundModelId": "gpt-4o",
    "copilot-lmapi.claudeCode.thinkingModelId": "o1-mini"
}
```

### 配置选项

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `port` | number | `8001` | HTTP 服务器端口 (1024-65535) |
| `host` | string | `"127.0.0.1"` | 服务器主机地址（仅本地访问）|
| `autoStart` | boolean | `false` | VS Code 启动时自动启动服务器 |
| `enableLogging` | boolean | `true` | 启用详细日志记录 |
| `maxConcurrentRequests` | number | `10` | 最大并发请求数 |
| `requestTimeout` | number | `120000` | 请求超时时间（毫秒）|
| `modelCacheRefreshInterval` | number | `300000` | 模型缓存刷新间隔（毫秒，默认5分钟）|
| `modelHealthCheckInterval` | number | `600000` | 模型健康检查间隔（毫秒，默认10分钟）|
| `claudeCode.backgroundModelId` | string | `""` | Claude Code 后台模型（用于 haiku 请求）|
| `claudeCode.thinkingModelId` | string | `""` | Claude Code 思考模型（用于 sonnet/opus 请求）|

## 🎯 使用方法

### 启动服务器

1. **命令面板**：按 `Ctrl+Shift+P` → 输入 "Copilot-LMAPI: Start LM API Server"
2. **状态栏**：点击右下角的服务器状态
3. **自动启动**：在设置中启用自动启动功能

### API 端点

#### OpenAI 兼容端点

##### 聊天完成
```bash
POST http://127.0.0.1:8001/v1/chat/completions
```

完全兼容 OpenAI Chat Completions API，包括：
- 流式和非流式响应
- 多模态输入（文本 + 图像）
- 函数/工具调用
- Temperature、top_p、max_tokens 参数
- 停止序列
- 存在和频率惩罚

**示例请求**：
```bash
curl -X POST http://127.0.0.1:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

##### 模型列表
```bash
GET http://127.0.0.1:8001/v1/models
```

动态返回当前 Copilot 环境中所有可用的模型列表，包括每个模型的能力信息（视觉支持、工具调用、流式响应等）。

常见模型包括：gpt-4o, claude-3.5-sonnet, gpt-4.1, claude-sonnet-4, gemini-2.0-flash-001, gemini-2.5-pro, o3-mini, o4-mini

#### Claude Code 兼容端点

##### 创建消息
```bash
POST http://127.0.0.1:8001/anthropic/claude/v1/messages
```

兼容 Anthropic Messages API 格式。

**示例请求**：
```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

**流式请求示例**：
```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Write a haiku about programming"}
    ]
  }'
```

##### 计算令牌数
```bash
POST http://127.0.0.1:8001/anthropic/claude/v1/messages/count_tokens
```

**示例请求**：
```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {"role": "user", "content": "Hello, Claude!"}
    ]
  }'
```

##### 模型列表
```bash
GET http://127.0.0.1:8001/anthropic/claude/v1/models
```

##### 获取特定模型信息
```bash
GET http://127.0.0.1:8001/anthropic/claude/v1/models/{model_id}
```

**示例**：
```bash
curl http://127.0.0.1:8001/anthropic/claude/v1/models/gpt-4o
```

#### 健康检查和状态

##### 健康检查
```bash
GET http://127.0.0.1:8001/health
```

返回服务器健康状态和指标。

##### 状态信息
```bash
GET http://127.0.0.1:8001/status
```

返回详细的服务器和 Copilot 状态信息。

## 🤖 Claude Code CLI 集成

### 设置 Claude Code 使用本地服务器

1. 启动 Copilot-LMAPI 扩展服务器

2. 设置环境变量：
   ```bash
   export ANTHROPIC_BASE_URL="http://127.0.0.1:8001/anthropic/claude"
   # 或使用 v1 路径
   export ANTHROPIC_BASE_URL="http://127.0.0.1:8001/anthropic/claude/v1"
   ```

3. 使用 Claude Code CLI：
   ```bash
   # 使用默认配置
   claude-code "Explain this function"
   
   # 指定模型
   claude-code --model claude-3-5-sonnet-20241022 "Write a Python function"
   ```

### 双模型路由配置

配置 Claude Code 的双模型路由，根据请求的模型名称自动选择不同的后端模型：

```json
{
  "copilot-lmapi.claudeCode.backgroundModelId": "gpt-4o",
  "copilot-lmapi.claudeCode.thinkingModelId": "o1-mini"
}
```

**路由规则**：
- 请求中包含 `haiku` → 使用 `backgroundModelId` 配置的模型
- 请求中包含 `sonnet` 或 `opus` → 使用 `thinkingModelId` 配置的模型
- 其他模型名称 → 回退到 `backgroundModelId`

**示例**：
```bash
# 这将使用 backgroundModelId (gpt-4o)
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -d '{"model": "claude-3-5-haiku-20241022", "max_tokens": 1024, ...}'

# 这将使用 thinkingModelId (o1-mini)
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -d '{"model": "claude-3-5-sonnet-20241022", "max_tokens": 1024, ...}'
```

## 📦 构建和打包

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/loved3d/Copilot-LMAPI.git
cd Copilot-LMAPI

# 安装依赖
npm ci

# 编译 TypeScript
npm run compile

# 打包为 VSIX
npm run package

# VSIX 文件将生成在根目录: copilot-lmapi-bridge-0.3.2.vsix
```

### 验证构建

```bash
# 安装扩展
code --install-extension copilot-lmapi-bridge-0.3.2.vsix

# 启动 VS Code 并启动服务器
# 然后测试端点

# OpenAI 兼容测试
curl http://127.0.0.1:8001/v1/models

# Claude Code 兼容测试
curl http://127.0.0.1:8001/anthropic/claude/v1/models

# 测试消息端点
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello!"}]
  }'
```

## 🔍 监控功能

### 状态栏
扩展在 VS Code 状态栏中添加状态指示器，显示：
- 服务器运行状态
- 端口号
- 快速访问控制

### 日志记录
详细日志可在以下位置查看：
1. **输出面板**：视图 → 输出 → "Copilot-LMAPI"
2. **命令**："Copilot-LMAPI: Show Server Status"

### 服务器指标
访问实时指标：
```
GET http://127.0.0.1:8001/status
```

## 🛡️ 安全特性

- **仅本地访问**：服务器默认仅绑定到 127.0.0.1
- **无需 API 密钥**：使用 VS Code 内置的 Copilot 身份验证
- **请求限制**：内置过度请求保护
- **请求验证**：全面的输入验证和清理
- **错误隔离**：单个请求错误不会影响服务器稳定性

## 🚨 故障排除

### 常见问题

#### "没有可用的 Copilot 模型"
- 确保你有有效的 GitHub Copilot 订阅
- 检查 Copilot 扩展已安装并在 VS Code 中正常工作
- 尝试重启 VS Code

#### "端口已被占用"
- 在设置中更改端口号
- 终止占用端口的进程：`lsof -ti:8001 | xargs kill`

#### "权限被拒绝"
- 确保 VS Code 有适当的权限
- 尝试以管理员身份运行 VS Code（Windows）或使用 sudo（macOS/Linux）

#### 响应缓慢
- 检查网络连接
- 监控扩展日志是否有错误
- 尝试在设置中减少并发请求数

### 调试模式
在设置中启用调试日志：
```json
{
    "copilot-lmapi.enableLogging": true
}
```

在 VS Code 的输出面板中查看日志。

