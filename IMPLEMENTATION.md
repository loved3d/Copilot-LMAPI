# Claude Code API Implementation Summary

## 实现概览

本次实现为 Copilot-LMAPI 扩展添加了完整的 Claude Code / Anthropic Messages API 兼容性，使其能够被 Claude Code CLI 和其他支持 Anthropic API 的工具使用。

## 主要功能

### 1. Anthropic Messages API 端点

实现了所有必需的端点：

- `POST /anthropic/claude/messages` - 创建消息（非版本化）
- `POST /anthropic/claude/v1/messages` - 创建消息（v1）
- `POST /anthropic/claude/messages/count_tokens` - 计算令牌数（非版本化）
- `POST /anthropic/claude/v1/messages/count_tokens` - 计算令牌数（v1）
- `GET /anthropic/claude/models` - 获取模型列表（非版本化）
- `GET /anthropic/claude/v1/models` - 获取模型列表（v1）
- `GET /anthropic/claude/models/:model` - 获取特定模型（非版本化）
- `GET /anthropic/claude/v1/models/:model` - 获取特定模型（v1）

### 2. 双模型路由机制

参考 vscode-lm-proxy 的设计，实现了智能模型路由：

- **Haiku 请求** → 路由到 `claudeCode.backgroundModelId` 配置的模型
- **Sonnet/Opus 请求** → 路由到 `claudeCode.thinkingModelId` 配置的模型
- **其他请求** → 回退到 `backgroundModelId`

这允许用户配置不同的后端模型来处理不同复杂度的任务。

### 3. 流式响应支持

完整实现了 Anthropic SSE (Server-Sent Events) 流式响应格式：

- `message_start` - 消息开始
- `content_block_start` - 内容块开始
- `content_block_delta` - 增量文本更新
- `content_block_stop` - 内容块结束
- `message_delta` - 消息元数据更新
- `message_stop` - 消息结束

### 4. 格式转换

实现了 Anthropic 和 VS Code LM API 之间的完整格式转换：

- **请求转换**：Anthropic messages → VS Code LanguageModelChatMessage
- **响应转换**：VS Code response → Anthropic message response
- **错误转换**：统一的 Anthropic 错误格式

### 5. 配置管理

新增 VS Code 配置项：

```json
{
  "copilot-lmapi.claudeCode.backgroundModelId": "",
  "copilot-lmapi.claudeCode.thinkingModelId": ""
}
```

## 技术架构

### 新增文件

1. **`src/types/Anthropic.ts`**
   - 完整的 Anthropic API 类型定义
   - 包括请求、响应、流式事件、内容块等类型

2. **`src/utils/AnthropicConverter.ts`**
   - 格式转换核心逻辑
   - Anthropic ↔ VS Code LM API 双向转换
   - SSE 流式事件生成

3. **`src/server/ClaudeCodeHandler.ts`**
   - Claude Code 请求处理器
   - 实现所有 Anthropic API 端点
   - 双模型路由逻辑
   - 错误处理

### 修改文件

1. **`src/server/CopilotServer.ts`**
   - 添加 ClaudeCodeHandler 集成
   - 新增路由逻辑 `routeClaudeCodeRequest()`
   - 支持 `/anthropic/claude/` 前缀路由

2. **`package.json`**
   - 添加 Claude Code 配置项
   - 更新打包脚本：`npm run package`
   - 输出 VSIX 到根目录

3. **`README.md`**
   - 完整的 Claude Code API 文档
   - 安装和配置说明
   - curl 示例
   - Claude Code CLI 集成指南

## 关键设计决策

### 1. 保持向后兼容
- 所有 OpenAI 兼容端点保持不变
- Claude Code 端点使用独立的路由前缀
- 不影响现有功能

### 2. 双模型路由
- 基于模型名称中的关键字（haiku/sonnet/opus）进行路由
- 支持用户自定义后端模型映射
- 空配置时直接使用请求的模型名称

### 3. 格式转换策略
- System prompt 转换为 VS Code user message 前缀
- 内容块统一处理（text/image/tool_use/tool_result）
- Token 估算使用字符数除以 4 的粗略算法

### 4. 错误处理
- 所有错误返回 Anthropic 格式
- VS Code LM API 错误码映射到对应的 HTTP 状态码
- 详细的错误消息记录到日志

## 使用流程

### 1. 构建和安装

```bash
# 克隆仓库
git clone https://github.com/loved3d/Copilot-LMAPI.git
cd Copilot-LMAPI

# 安装依赖
npm ci

# 编译
npm run compile

# 打包
npm run package

# 安装扩展
code --install-extension copilot-lmapi-bridge-0.3.2.vsix
```

### 2. 配置

在 VS Code 设置中配置（可选）：

```json
{
  "copilot-lmapi.port": 8001,
  "copilot-lmapi.autoStart": true,
  "copilot-lmapi.claudeCode.backgroundModelId": "gpt-4o",
  "copilot-lmapi.claudeCode.thinkingModelId": "o1-mini"
}
```

### 3. 启动服务器

- 命令面板：`Copilot-LMAPI: Start LM API Server`
- 或启用 `autoStart` 配置

### 4. 使用 Claude Code CLI

```bash
# 设置环境变量
export ANTHROPIC_BASE_URL="http://127.0.0.1:8001/anthropic/claude/v1"

# 使用 Claude Code
claude-code "Explain this code"
```

### 5. 使用 curl 测试

```bash
# 获取模型列表
curl http://127.0.0.1:8001/anthropic/claude/v1/models

# 创建消息
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# 流式请求
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "stream": true,
    "messages": [{"role": "user", "content": "Count to 5"}]
  }'
```

## 测试建议

详细的测试步骤请参考 `TESTING.md` 文件，包括：

1. OpenAI 兼容性测试（确保不破坏现有功能）
2. Claude Code 端点功能测试
3. 流式响应测试
4. 双模型路由测试
5. 错误处理测试
6. Claude Code CLI 集成测试

## 已知限制

1. **Token 计数**：使用简单的字符数估算（1 token ≈ 4 chars），不如官方精确
2. **工具调用**：基础支持，但未完全实现 Anthropic 的工具调用格式转换
3. **多模态内容**：图像内容转换为占位符文本，需要模型支持视觉功能
4. **速率限制**：使用全局并发限制，未针对不同端点分别限制

## 后续改进建议

1. 实现更精确的 token 计数算法
2. 完善工具调用的双向转换
3. 添加更多的模型路由策略（基于内容长度、复杂度等）
4. 实现请求缓存和结果缓存
5. 添加单元测试和集成测试
6. 支持更多 Anthropic API 特性（如 prompt caching）

## 交付物清单

✅ 1. VSIX 文件：`copilot-lmapi-bridge-0.3.2.vsix`
✅ 2. 安装说明：README.md 中完整的安装章节
✅ 3. 使用文档：README.md 中 Claude Code 集成指南
✅ 4. curl 示例：多个实际可用的 curl 命令
✅ 5. 测试指南：TESTING.md 文件
✅ 6. 向后兼容：OpenAI 端点功能完全保留
✅ 7. 配置选项：VS Code 设置中的双模型配置
✅ 8. 全部 8 个端点：messages、count_tokens、models（含 v1 和非 v1 版本）

## 代码统计

- 新增类型定义：~200 行（Anthropic.ts）
- 新增转换逻辑：~300 行（AnthropicConverter.ts）
- 新增处理器：~350 行（ClaudeCodeHandler.ts）
- 修改服务器：~100 行（CopilotServer.ts）
- 文档更新：~500 行（README.md + TESTING.md）

总计：~1450 行新代码

## 版本信息

- 扩展版本：0.3.2
- VSIX 文件：copilot-lmapi-bridge-0.3.2.vsix
- 文件大小：~169 KB
- 包含文件：86 个文件

## 贡献者

本实现基于以下参考：
- [ryonakae/vscode-lm-proxy](https://github.com/ryonakae/vscode-lm-proxy) - Claude Code 接口设计参考
- [Anthropic Claude API](https://docs.anthropic.com/en/api) - 官方 API 文档
