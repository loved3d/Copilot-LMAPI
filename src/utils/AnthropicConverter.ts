/**
 * Anthropic API Converter
 * Converts between Anthropic Claude API format and VS Code LM API format
 */

import * as vscode from 'vscode';
import {
    AnthropicMessage,
    AnthropicMessagesRequest,
    AnthropicMessagesResponse,
    AnthropicStreamEvent,
    AnthropicUsage,
    ContentBlock,
    TextContent,
    AnthropicModel,
    AnthropicModelsResponse,
    AnthropicCountTokensResponse,
    AnthropicErrorResponse
} from '../types/Anthropic';
import { ModelCapabilities } from '../types/ModelCapabilities';
import { logger } from './Logger';

export class AnthropicConverter {
    
    /**
     * Convert Anthropic messages to VS Code LM API format
     */
    public static async convertAnthropicToVSCode(
        request: AnthropicMessagesRequest,
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage[]> {
        const vsCodeMessages: vscode.LanguageModelChatMessage[] = [];
        
        // Handle system prompt - VS Code doesn't have a dedicated system role,
        // so we prepend it as a user message
        if (request.system) {
            const systemContent = typeof request.system === 'string' 
                ? request.system 
                : request.system.map(block => block.text).join('\n');
            
            vsCodeMessages.push(new vscode.LanguageModelChatMessage(
                vscode.LanguageModelChatMessageRole.User,
                `[System]: ${systemContent}`
            ));
        }
        
        // Convert messages
        for (const message of request.messages) {
            const vsCodeMessage = await this.convertSingleMessage(message, selectedModel);
            if (vsCodeMessage) {
                vsCodeMessages.push(vsCodeMessage);
            }
        }
        
        return vsCodeMessages;
    }
    
    /**
     * Convert a single Anthropic message to VS Code format
     */
    private static async convertSingleMessage(
        message: AnthropicMessage,
        selectedModel: ModelCapabilities
    ): Promise<vscode.LanguageModelChatMessage | null> {
        const role = message.role === 'user' 
            ? vscode.LanguageModelChatMessageRole.User 
            : vscode.LanguageModelChatMessageRole.Assistant;
        
        // Handle simple text content
        if (typeof message.content === 'string') {
            return new vscode.LanguageModelChatMessage(role, message.content);
        }
        
        // Handle content blocks
        if (Array.isArray(message.content)) {
            let textContent = '';
            
            for (const block of message.content) {
                if (block.type === 'text') {
                    textContent += block.text;
                } else if (block.type === 'image') {
                    // For now, append image placeholder
                    // TODO: Support images if model supports vision
                    textContent += '[Image content]';
                } else if (block.type === 'tool_use') {
                    textContent += `[Tool Use: ${block.name}]`;
                } else if (block.type === 'tool_result') {
                    const resultText = typeof block.content === 'string' 
                        ? block.content 
                        : block.content.map(c => c.text).join('\n');
                    textContent += `[Tool Result: ${resultText}]`;
                }
            }
            
            return new vscode.LanguageModelChatMessage(role, textContent);
        }
        
        return null;
    }
    
    /**
     * Convert VS Code LM API response to Anthropic format
     */
    public static async convertVSCodeToAnthropic(
        response: vscode.LanguageModelChatResponse,
        requestId: string,
        model: string
    ): Promise<AnthropicMessagesResponse> {
        // Collect full response
        let fullContent = '';
        for await (const chunk of response.text) {
            fullContent += chunk;
        }
        
        const contentBlock: TextContent = {
            type: 'text',
            text: fullContent
        };
        
        // Estimate token usage (rough approximation)
        const inputTokens = Math.ceil(fullContent.length / 4);
        const outputTokens = Math.ceil(fullContent.length / 4);
        
        return {
            id: `msg_${requestId}`,
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
     * Convert VS Code streaming response to Anthropic SSE events
     */
    public static async *convertVSCodeStreamToAnthropic(
        response: vscode.LanguageModelChatResponse,
        requestId: string,
        model: string
    ): AsyncGenerator<string> {
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let contentIndex = 0;
        
        // Send message_start event
        const messageStart: AnthropicStreamEvent = {
            type: 'message_start',
            message: {
                id: `msg_${requestId}`,
                type: 'message',
                role: 'assistant',
                content: [],
                model: model,
                stop_reason: null,
                stop_sequence: null,
                usage: {
                    input_tokens: 0,
                    output_tokens: 0
                }
            }
        };
        yield this.formatSSE('message_start', messageStart);
        
        // Send content_block_start
        const blockStart: AnthropicStreamEvent = {
            type: 'content_block_start',
            index: contentIndex,
            content_block: {
                type: 'text',
                text: ''
            }
        };
        yield this.formatSSE('content_block_start', blockStart);
        
        // Stream content deltas
        for await (const chunk of response.text) {
            const delta: AnthropicStreamEvent = {
                type: 'content_block_delta',
                index: contentIndex,
                delta: {
                    type: 'text_delta',
                    text: chunk
                }
            };
            yield this.formatSSE('content_block_delta', delta);
            
            totalOutputTokens += Math.ceil(chunk.length / 4);
        }
        
        // Send content_block_stop
        const blockStop: AnthropicStreamEvent = {
            type: 'content_block_stop',
            index: contentIndex
        };
        yield this.formatSSE('content_block_stop', blockStop);
        
        // Send message_delta
        const messageDelta: AnthropicStreamEvent = {
            type: 'message_delta',
            delta: {
                stop_reason: 'end_turn',
                stop_sequence: null
            },
            usage: {
                output_tokens: totalOutputTokens
            }
        };
        yield this.formatSSE('message_delta', messageDelta);
        
        // Send message_stop
        const messageStop: AnthropicStreamEvent = {
            type: 'message_stop'
        };
        yield this.formatSSE('message_stop', messageStop);
    }
    
    /**
     * Format SSE event
     */
    private static formatSSE(eventType: string, data: any): string {
        return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    }
    
    /**
     * Convert model capabilities to Anthropic model format
     */
    public static convertModelToAnthropic(model: ModelCapabilities): AnthropicModel {
        return {
            id: model.id,
            type: 'model',
            display_name: model.id, // Use id as display name since name doesn't exist
            created_at: new Date().toISOString()
        };
    }
    
    /**
     * Create Anthropic models list response
     */
    public static createModelsResponse(models: ModelCapabilities[]): AnthropicModelsResponse {
        return {
            data: models.map(m => this.convertModelToAnthropic(m)),
            has_more: false
        };
    }
    
    /**
     * Estimate token count for messages
     */
    public static estimateTokenCount(request: AnthropicMessagesRequest): AnthropicCountTokensResponse {
        let totalChars = 0;
        
        // Count system prompt
        if (request.system) {
            totalChars += typeof request.system === 'string' 
                ? request.system.length 
                : request.system.map(b => b.text).join('').length;
        }
        
        // Count messages
        for (const message of request.messages) {
            if (typeof message.content === 'string') {
                totalChars += message.content.length;
            } else if (Array.isArray(message.content)) {
                for (const block of message.content) {
                    if (block.type === 'text') {
                        totalChars += block.text.length;
                    }
                }
            }
        }
        
        // Rough approximation: 1 token ≈ 4 characters
        return {
            input_tokens: Math.ceil(totalChars / 4)
        };
    }
    
    /**
     * Create Anthropic error response
     */
    public static createErrorResponse(
        type: string,
        message: string
    ): AnthropicErrorResponse {
        return {
            type: 'error',
            error: {
                type,
                message
            }
        };
    }
}
