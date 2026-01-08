# Claude Code API Implementation - Test Guide

## Prerequisites
1. VS Code with GitHub Copilot installed and activated
2. The Copilot-LMAPI extension installed from VSIX file
3. curl or similar HTTP client

## Installation Steps

```bash
# Install the extension
code --install-extension copilot-lmapi-bridge-0.3.2.vsix

# Restart VS Code if necessary
```

## Starting the Server

1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Copilot-LMAPI: Start LM API Server"
4. Press Enter

The server should start on http://127.0.0.1:8001 (default port)

## Test Cases

### 1. Test OpenAI Compatible Endpoints (Baseline)

These tests verify that existing OpenAI functionality still works:

```bash
# Get available models
curl http://127.0.0.1:8001/v1/models

# Test chat completions
curl -X POST http://127.0.0.1:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Say hello"}],
    "stream": false
  }'
```

### 2. Test Claude Code API Endpoints

#### 2.1 Get Models List

```bash
# Without version prefix
curl http://127.0.0.1:8001/anthropic/claude/models

# With v1 prefix
curl http://127.0.0.1:8001/anthropic/claude/v1/models
```

**Expected**: JSON response with list of available models in Anthropic format

#### 2.2 Get Specific Model

```bash
# Get specific model info
curl http://127.0.0.1:8001/anthropic/claude/v1/models/gpt-4o
```

**Expected**: JSON response with model details

#### 2.3 Create Message (Non-Streaming)

```bash
# Without version prefix
curl -X POST http://127.0.0.1:8001/anthropic/claude/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "What is 2+2?"}
    ]
  }'

# With v1 prefix
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "What is 2+2?"}
    ]
  }'
```

**Expected**: JSON response in Anthropic format with:
- `id`: message ID
- `type`: "message"
- `role`: "assistant"
- `content`: array with text response
- `usage`: token counts

#### 2.4 Create Message (Streaming)

```bash
# Streaming request
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Count from 1 to 5"}
    ]
  }'
```

**Expected**: Server-Sent Events (SSE) stream with events:
- `message_start`
- `content_block_start`
- `content_block_delta` (multiple)
- `content_block_stop`
- `message_delta`
- `message_stop`

#### 2.5 Count Tokens

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

**Expected**: JSON response with `input_tokens` field

### 3. Test Dual-Model Routing

Configure models in VS Code settings:
```json
{
  "copilot-lmapi.claudeCode.backgroundModelId": "gpt-4o",
  "copilot-lmapi.claudeCode.thinkingModelId": "o1-mini"
}
```

#### 3.1 Test Haiku Routing (Background Model)

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Quick test"}
    ]
  }'
```

**Expected**: Request should be routed to `backgroundModelId` (check VS Code output logs)

#### 3.2 Test Sonnet Routing (Thinking Model)

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Complex reasoning test"}
    ]
  }'
```

**Expected**: Request should be routed to `thinkingModelId` (check VS Code output logs)

#### 3.3 Test Opus Routing (Thinking Model)

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-opus-20240229",
    "max_tokens": 100,
    "messages": [
      {"role": "user", "content": "Another test"}
    ]
  }'
```

**Expected**: Request should be routed to `thinkingModelId` (check VS Code output logs)

### 4. Test Claude Code CLI Integration

Set up environment variable:
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:8001/anthropic/claude/v1"
```

If you have Claude Code CLI installed:
```bash
# Run a simple command
claude-code "What is Python?"

# Or if using another client that supports Anthropic API
# anthropic-client --base-url http://127.0.0.1:8001/anthropic/claude/v1 ...
```

### 5. Test System Prompts

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "max_tokens": 100,
    "system": "You are a helpful assistant that speaks like a pirate.",
    "messages": [
      {"role": "user", "content": "Tell me about programming"}
    ]
  }'
```

**Expected**: Response should incorporate the system prompt style

### 6. Error Handling Tests

#### 6.1 Missing Required Fields

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "test"}]
  }'
```

**Expected**: 400 error with message about missing `max_tokens`

#### 6.2 Invalid Model

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nonexistent-model",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "test"}]
  }'
```

**Expected**: 404 error with message about model not found

#### 6.3 Invalid JSON

```bash
curl -X POST http://127.0.0.1:8001/anthropic/claude/v1/messages \
  -H "Content-Type: application/json" \
  -d 'invalid json'
```

**Expected**: 400 error with message about invalid JSON

## Checking Logs

To see detailed logs of what's happening:

1. Open VS Code Output panel: View → Output
2. Select "Copilot-LMAPI" from the dropdown
3. Watch the logs as requests come in

Look for log messages like:
- "🤖 Processing Claude Code messages request"
- "Claude Code routing: haiku -> background model: ..."
- "Claude Code routing: sonnet/opus -> thinking model: ..."

## Health Check

```bash
# Check server health
curl http://127.0.0.1:8001/health

# Check detailed status
curl http://127.0.0.1:8001/status
```

## Success Criteria

✅ All OpenAI endpoints still work (backward compatibility)
✅ All Claude Code endpoints return proper Anthropic-formatted responses
✅ Streaming works with proper SSE events
✅ Dual-model routing correctly routes haiku/sonnet/opus requests
✅ Error handling returns Anthropic-formatted errors
✅ Token counting returns reasonable estimates
✅ Claude Code CLI can connect and use the server
✅ System prompts are properly handled

## Common Issues

### Server Won't Start
- Check if GitHub Copilot is installed and activated
- Check if the port 8001 is already in use
- Try a different port in settings

### No Models Available
- Ensure GitHub Copilot subscription is active
- Restart VS Code and try again

### Requests Fail
- Check VS Code Output logs for detailed error messages
- Verify the server is running (check status bar)
- Try the health check endpoint first
