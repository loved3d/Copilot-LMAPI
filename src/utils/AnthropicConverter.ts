/**
 * Anthropic API 转换器
 * 在 Anthropic Messages API 格式与 VS Code LM API 之间转换
 */

import * as vscode from 'vscode';
import {
    AnthropicMessage,
    AnthropicMessagesRequest,
    AnthropicMessagesResponse,
    AnthropicContentBlock,
    AnthropicTextContent,
    AnthropicUsage,
    AnthropicStreamEvent,
    AnthropicErrorResponse,
    AnthropicModelsResponse,
    AnthropicModel,
    AnthropicCountTokensRequest,
    AnthropicCountTokensResponse
} from '../types/Anthropic';
import { ModelCapabilities } from '../types/ModelCapabilities';
import { logger } from './Logger';

export class AnthropicConverter {
    
    /**
     * 将 Anthropic 消息转换为 VS Code LM API 格式
     */
    public static async convertMessagesToVSCode(
        request: AnthropicMessagesRequest,
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage[]> {
        const vsCodeMessages: vscode.LanguageModelChatMessage[] = [];
        
        // 处理系统提示 - 在 VSCode LM API 中，我们将其作为用户消息前缀
        let systemPrompt = '';
        if (request.system) {
            if (typeof request.system === 'string') {
                systemPrompt = request.system;
            } else if (Array.isArray(request.system)) {
                systemPrompt = request.system
                    .filter(block => block.type === 'text')
                    .map(block => block.text)
                    .join('\n');
            }
        }
        
        // 转换消息
        for (let i = 0; i < request.messages.length; i++) {
            const message = request.messages[i];
            const vsCodeMessage = await this.convertSingleMessage(
                message, 
                selectedModel,
                i === 0 && systemPrompt ? systemPrompt : undefined
            );
            
            if (vsCodeMessage) {
                vsCodeMessages.push(vsCodeMessage);
            }
        }
        
        return vsCodeMessages;
    }
    
    /**
     * 转换单个 Anthropic 消息
     */
    private static async convertSingleMessage(
        message: AnthropicMessage,
        selectedModel: ModelCapabilities,
        systemPrompt?: string
    ): Promise<vscode.LanguageModelChatMessage | null> {
        
        // 将角色映射到 VSCode
        const role = message.role === 'assistant' 
            ? vscode.LanguageModelChatMessageRole.Assistant 
            : vscode.LanguageModelChatMessageRole.User;
        
        // 处理简单文本消息
        if (typeof message.content === 'string') {
            let content = message.content;
            
            // 如果是第一条用户消息，添加系统提示
            if (systemPrompt && message.role === 'user') {
                content = `System: ${systemPrompt}\n\n${content}`;
            }
            
            return new vscode.LanguageModelChatMessage(role, content);
        }
        
        // 处理复杂的内容块
        if (Array.isArray(message.content)) {
            let textContent = '';
            
            // 如果是第一条用户消息，添加系统提示
            if (systemPrompt && message.role === 'user') {
                textContent = `System: ${systemPrompt}\n\n`;
            }
            
            for (const block of message.content) {
                if (block.type === 'text') {
                    textContent += block.text;
                } else if (block.type === 'tool_result') {
                    // 处理工具结果
                    if (typeof block.content === 'string') {
                        textContent += `\nTool Result (${block.tool_use_id}): ${block.content}`;
                    } else if (Array.isArray(block.content)) {
                        const resultText = block.content
                            .filter(c => c.type === 'text')
                            .map(c => (c as AnthropicTextContent).text)
                            .join('\n');
                        textContent += `\nTool Result (${block.tool_use_id}): ${resultText}`;
                    }
                }
                // Note: 图像和工具使用在这里不完全支持，因为 VSCode LM API 的限制
            }
            
            return new vscode.LanguageModelChatMessage(role, textContent);
        }
        
        return null;
    }
    
    /**
     * 从 VS Code 响应创建 Anthropic 消息响应
     */
    public static createAnthropicResponse(
        content: string,
        model: string,
        inputTokens: number,
        outputTokens: number
    ): AnthropicMessagesResponse {
        const contentBlock: AnthropicTextContent = {
            type: 'text',
            text: content
        };
        
        return {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'message',
            role: 'assistant',
            content: [contentBlock],
            model: model,
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: inputTokens,
                output_tokens: outputTokens
            }
        };
    }
    
    /**
     * 从 VS Code 流式响应创建 Anthropic SSE 事件
     */
    public static async *convertStreamToAnthropic(
        response: vscode.LanguageModelChatResponse,
        model: string,
        inputTokens: number
    ): AsyncGenerator<string> {
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 发送 message_start 事件
        yield this.createSSEEvent({
            type: 'message_start',
            message: {
                id: messageId,
                type: 'message',
                role: 'assistant',
                content: [],
                model: model,
                stop_reason: null,
                stop_sequence: null,
                usage: {
                    input_tokens: inputTokens,
                    output_tokens: 0
                }
            }
        });
        
        // 发送 content_block_start 事件
        yield this.createSSEEvent({
            type: 'content_block_start',
            index: 0,
            content_block: {
                type: 'text',
                text: ''
            }
        });
        
        // 收集和发送增量内容
        let totalOutputTokens = 0;
        
        try {
            for await (const chunk of response.text) {
                if (chunk) {
                    // 估算令牌
                    const chunkTokens = Math.ceil(chunk.length / 4);
                    totalOutputTokens += chunkTokens;
                    
                    // 发送 content_block_delta 事件
                    yield this.createSSEEvent({
                        type: 'content_block_delta',
                        index: 0,
                        delta: {
                            type: 'text_delta',
                            text: chunk
                        }
                    });
                }
            }
        } catch (error) {
            logger.error('Anthropic streaming error:', error as Error);
            yield this.createSSEEvent({
                type: 'error',
                error: {
                    type: 'api_error',
                    message: `Streaming error: ${(error as Error).message}`
                }
            });
            return;
        }
        
        // 发送 content_block_stop 事件
        yield this.createSSEEvent({
            type: 'content_block_stop',
            index: 0
        });
        
        // 发送 message_delta 事件
        yield this.createSSEEvent({
            type: 'message_delta',
            delta: {
                stop_reason: 'end_turn',
                stop_sequence: null
            },
            usage: {
                output_tokens: totalOutputTokens
            }
        });
        
        // 发送 message_stop 事件
        yield this.createSSEEvent({
            type: 'message_stop'
        });
    }
    
    /**
     * 创建 SSE 事件字符串
     */
    private static createSSEEvent(event: AnthropicStreamEvent): string {
        return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    }
    
    /**
     * 收集完整的 VS Code 响应
     */
    public static async collectFullResponse(
        response: vscode.LanguageModelChatResponse
    ): Promise<string> {
        let fullContent = '';
        
        for await (const chunk of response.text) {
            fullContent += chunk;
        }
        
        return fullContent;
    }
    
    /**
     * 创建 Anthropic 错误响应
     */
    public static createErrorResponse(
        type: string,
        message: string
    ): AnthropicErrorResponse {
        return {
            type: 'error',
            error: {
                type: type,
                message: message
            }
        };
    }
    
    /**
     * 创建 Anthropic 模型列表响应
     */
    public static createModelsResponse(
        models: ModelCapabilities[]
    ): AnthropicModelsResponse {
        const anthropicModels: AnthropicModel[] = models.map(model => ({
            id: model.id,
            type: 'model' as const,
            display_name: model.name || model.id,
            created_at: new Date().toISOString()
        }));
        
        return {
            data: anthropicModels,
            has_more: false,
            first_id: anthropicModels.length > 0 ? anthropicModels[0].id : null,
            last_id: anthropicModels.length > 0 ? anthropicModels[anthropicModels.length - 1].id : null
        };
    }
    
    /**
     * 估算令牌数量（简单估算）
     */
    public static estimateTokens(text: string): number {
        // 简单估算：平均每个令牌 4 个字符
        return Math.ceil(text.length / 4);
    }
    
    /**
     * 计算请求中的令牌数量（支持两种请求类型）
     */
    public static countRequestTokens(request: AnthropicMessagesRequest | AnthropicCountTokensRequest): number {
        let tokenCount = 0;
        
        // 计算系统提示令牌
        if (request.system) {
            if (typeof request.system === 'string') {
                tokenCount += this.estimateTokens(request.system);
            } else if (Array.isArray(request.system)) {
                for (const block of request.system) {
                    if (block.type === 'text') {
                        tokenCount += this.estimateTokens(block.text);
                    }
                }
            }
        }
        
        // 计算消息令牌
        for (const message of request.messages) {
            if (typeof message.content === 'string') {
                tokenCount += this.estimateTokens(message.content);
            } else if (Array.isArray(message.content)) {
                for (const block of message.content) {
                    if (block.type === 'text') {
                        tokenCount += this.estimateTokens(block.text);
                    }
                }
            }
            
            // 每条消息添加少量令牌用于格式化
            tokenCount += 4;
        }
        
        return tokenCount;
    }
    
    /**
     * 创建 count_tokens 响应
     */
    public static createCountTokensResponse(
        request: AnthropicCountTokensRequest
    ): AnthropicCountTokensResponse {
        return {
            input_tokens: this.countRequestTokens(request)
        };
    }
}
