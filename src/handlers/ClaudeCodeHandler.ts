/**
 * Claude Code 请求处理器
 * 处理 Claude Code 兼容的 API 端点
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { URL } from 'url';

import { logger } from '../utils/Logger';
import { AnthropicConverter } from '../utils/AnthropicConverter';
import { ModelDiscoveryService } from '../services/ModelDiscoveryService';
import { Validator } from '../utils/Validator';
import {
    AnthropicMessagesRequest,
    AnthropicCountTokensRequest
} from '../types/Anthropic';
import { ModelCapabilities } from '../types/ModelCapabilities';
import { HTTP_STATUS, CONTENT_TYPES, SSE_HEADERS } from '../constants/Config';

export class ClaudeCodeHandler {
    private modelDiscovery: ModelDiscoveryService;
    
    constructor(modelDiscovery: ModelDiscoveryService) {
        this.modelDiscovery = modelDiscovery;
    }
    
    /**
     * 路由 Claude Code 请求
     */
    public async handleRequest(
        pathname: string,
        method: string,
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<boolean> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        // 匹配路径和方法
        if (method === 'POST') {
            if (pathname === '/anthropic/claude/messages' || pathname === '/anthropic/claude/v1/messages' || pathname === '/v1/messages') {
                await this.handleMessages(req, res, requestId);
                return true;
            }
            
            if (pathname === '/anthropic/claude/messages/count_tokens' || pathname === '/anthropic/claude/v1/messages/count_tokens') {
                await this.handleCountTokens(req, res, requestId);
                return true;
            }
        }
        
        if (method === 'GET') {
            if (pathname === '/anthropic/claude/models' || pathname === '/anthropic/claude/v1/models') {
                await this.handleListModels(req, res, requestId);
                return true;
            }
            
            // 匹配 /anthropic/claude/models/:model 或 /anthropic/claude/v1/models/:model
            const modelMatch = pathname.match(/^\/anthropic\/claude\/(v1\/)?models\/([^/]+)$/);
            if (modelMatch) {
                const modelId = decodeURIComponent(modelMatch[2]);
                await this.handleGetModel(req, res, requestId, modelId);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 处理 /anthropic/claude/v1/messages
     */
    public async handleMessages(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('🎨 Processing Claude Code messages request');
            
            // 读取并解析请求体
            const body = await this.readRequestBody(req);
            let requestData: AnthropicMessagesRequest;
            
            try {
                requestData = JSON.parse(body);
            } catch (parseError) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.BAD_REQUEST,
                    'invalid_request_error',
                    'Invalid JSON in request body'
                );
                return;
            }
            
            // 验证必需字段
            if (!requestData.model) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.BAD_REQUEST,
                    'invalid_request_error',
                    'Missing required field: model'
                );
                return;
            }
            
            if (!requestData.messages || !Array.isArray(requestData.messages)) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.BAD_REQUEST,
                    'invalid_request_error',
                    'Missing or invalid required field: messages'
                );
                return;
            }
            
            // 如果没有提供 max_tokens，使用默认值
            if (!requestData.max_tokens) {
                requestData.max_tokens = 4096;
            }
            
            // 选择模型（使用 Claude Code 双模型路由）
            const selectedModel = await this.selectModel(requestData.model);
            
            if (!selectedModel) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.NOT_FOUND,
                    'not_found_error',
                    `Model '${requestData.model}' not found or unavailable`
                );
                return;
            }
            
            requestLogger.info('📋 Selected model:', {
                requested: requestData.model,
                selected: selectedModel.id,
                vendor: selectedModel.vendor
            });
            
            // 检查 Copilot 访问
            const hasAccess = await this.checkCopilotAccess();
            if (!hasAccess) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.UNAUTHORIZED,
                    'authentication_error',
                    'GitHub Copilot access required'
                );
                return;
            }
            
            // 转换消息到 VS Code 格式
            const vsCodeMessages = await AnthropicConverter.convertMessagesToVSCode(
                requestData,
                selectedModel
            );
            
            // 计算输入令牌
            const inputTokens = AnthropicConverter.countRequestTokens(requestData);
            
            // 发送请求到 VS Code LM API
            try {
                const response = await selectedModel.vsCodeModel.sendRequest(
                    vsCodeMessages,
                    {},
                    new vscode.CancellationTokenSource().token
                );
                
                // 处理流式或非流式响应
                if (requestData.stream) {
                    await this.handleStreamingResponse(
                        response,
                        res,
                        selectedModel.id,
                        inputTokens,
                        requestLogger
                    );
                } else {
                    await this.handleNonStreamingResponse(
                        response,
                        res,
                        selectedModel.id,
                        inputTokens,
                        requestLogger
                    );
                }
            } catch (lmError) {
                requestLogger.error('❌ VS Code LM API error:', lmError as Error);
                
                if (lmError instanceof vscode.LanguageModelError) {
                    this.handleLanguageModelError(lmError, res);
                } else {
                    this.sendErrorResponse(
                        res,
                        HTTP_STATUS.INTERNAL_SERVER_ERROR,
                        'api_error',
                        `Language model request failed: ${lmError}`
                    );
                }
            }
            
        } catch (error) {
            requestLogger.error('❌ Error handling Claude Code messages:', error as Error);
            
            if (!res.headersSent) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    'api_error',
                    'Internal server error'
                );
            }
        }
    }
    
    /**
     * 处理流式响应
     */
    private async handleStreamingResponse(
        response: vscode.LanguageModelChatResponse,
        res: http.ServerResponse,
        model: string,
        inputTokens: number,
        requestLogger: any
    ): Promise<void> {
        res.writeHead(HTTP_STATUS.OK, SSE_HEADERS);
        
        try {
            requestLogger.info('🌊 Starting Anthropic streaming response...');
            
            let chunkCount = 0;
            
            for await (const event of AnthropicConverter.convertStreamToAnthropic(
                response,
                model,
                inputTokens
            )) {
                res.write(event);
                chunkCount++;
            }
            
            requestLogger.info(`✅ Anthropic streaming completed: ${chunkCount} events sent`);
            
        } catch (error) {
            requestLogger.error('❌ Anthropic streaming error:', error);
            
            const errorEvent = `event: error\ndata: ${JSON.stringify({
                type: 'error',
                error: {
                    type: 'api_error',
                    message: 'Stream processing error'
                }
            })}\n\n`;
            res.write(errorEvent);
        } finally {
            res.end();
        }
    }
    
    /**
     * 处理非流式响应
     */
    private async handleNonStreamingResponse(
        response: vscode.LanguageModelChatResponse,
        res: http.ServerResponse,
        model: string,
        inputTokens: number,
        requestLogger: any
    ): Promise<void> {
        try {
            requestLogger.info('📋 Collecting Anthropic full response...');
            
            const fullContent = await AnthropicConverter.collectFullResponse(response);
            const outputTokens = AnthropicConverter.estimateTokens(fullContent);
            
            const anthropicResponse = AnthropicConverter.createAnthropicResponse(
                fullContent,
                model,
                inputTokens,
                outputTokens
            );
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(anthropicResponse, null, 2));
            
            requestLogger.info('✅ Anthropic response sent:', {
                contentLength: fullContent.length,
                inputTokens: inputTokens,
                outputTokens: outputTokens
            });
            
        } catch (error) {
            requestLogger.error('❌ Error collecting Anthropic response:', error as Error);
            throw error;
        }
    }
    
    /**
     * 处理 /anthropic/claude/v1/messages/count_tokens
     */
    public async handleCountTokens(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('📊 Processing Claude Code count_tokens request');
            
            const body = await this.readRequestBody(req);
            let requestData: AnthropicCountTokensRequest;
            
            try {
                requestData = JSON.parse(body);
            } catch (parseError) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.BAD_REQUEST,
                    'invalid_request_error',
                    'Invalid JSON in request body'
                );
                return;
            }
            
            const countResponse = AnthropicConverter.createCountTokensResponse(requestData);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(countResponse, null, 2));
            
            requestLogger.info('✅ Count tokens response sent:', countResponse);
            
        } catch (error) {
            requestLogger.error('❌ Error handling count_tokens:', error as Error);
            
            if (!res.headersSent) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    'api_error',
                    'Internal server error'
                );
            }
        }
    }
    
    /**
     * 处理 /anthropic/claude/v1/models
     */
    private async handleListModels(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('📋 Fetching Claude Code models...');
            
            const allModels = this.modelDiscovery.getAllModels();
            const modelsResponse = AnthropicConverter.createModelsResponse(allModels);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(modelsResponse, null, 2));
            
            requestLogger.info(`✅ Claude Code models response sent with ${modelsResponse.data.length} models`);
            
        } catch (error) {
            requestLogger.error('❌ Error handling list models:', error as Error);
            
            if (!res.headersSent) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    'api_error',
                    'Failed to retrieve models'
                );
            }
        }
    }
    
    /**
     * 处理 /anthropic/claude/v1/models/:model
     */
    private async handleGetModel(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string,
        modelId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info(`📋 Fetching Claude Code model: ${modelId}`);
            
            const model = this.modelDiscovery.getModel(modelId);
            
            if (!model) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.NOT_FOUND,
                    'not_found_error',
                    `Model '${modelId}' not found`
                );
                return;
            }
            
            const anthropicModel = {
                id: model.id,
                type: 'model' as const,
                display_name: model.name || model.id,
                created_at: new Date().toISOString()
            };
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(anthropicModel, null, 2));
            
            requestLogger.info(`✅ Claude Code model response sent for ${modelId}`);
            
        } catch (error) {
            requestLogger.error('❌ Error handling get model:', error as Error);
            
            if (!res.headersSent) {
                this.sendErrorResponse(
                    res,
                    HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    'api_error',
                    'Failed to retrieve model'
                );
            }
        }
    }
    
    /**
     * 选择模型（Claude Code 双模型路由）
     */
    private async selectModel(requestedModel: string): Promise<ModelCapabilities | null> {
        const config = vscode.workspace.getConfiguration('copilot-lmapi');
        
        // 获取配置的模型
        const backgroundModelId = config.get<string>('claudeCode.backgroundModelId');
        const thinkingModelId = config.get<string>('claudeCode.thinkingModelId');
        
        // Claude Code 双模型路由逻辑
        const modelLower = requestedModel.toLowerCase();
        
        let targetModelId: string | undefined;
        
        if (modelLower.includes('haiku')) {
            // haiku -> background model
            targetModelId = backgroundModelId;
            logger.info(`🔄 Claude Code routing: haiku detected -> using background model (${backgroundModelId || 'not configured'})`);
        } else if (modelLower.includes('sonnet') || modelLower.includes('opus')) {
            // sonnet/opus -> thinking model
            targetModelId = thinkingModelId;
            logger.info(`🔄 Claude Code routing: sonnet/opus detected -> using thinking model (${thinkingModelId || 'not configured'})`);
        }
        
        // 如果配置了目标模型，尝试使用它
        if (targetModelId) {
            const model = this.modelDiscovery.getModel(targetModelId);
            if (model) {
                return model;
            }
            logger.warn(`⚠️ Configured model ${targetModelId} not found, trying direct match`);
        }
        
        // Fallback 1: 尝试直接匹配请求的模型
        let model = this.modelDiscovery.getModel(requestedModel);
        if (model) {
            return model;
        }
        
        // Fallback 2: 使用 background model（如果配置）
        if (backgroundModelId) {
            model = this.modelDiscovery.getModel(backgroundModelId);
            if (model) {
                logger.info(`🔄 Fallback to background model: ${backgroundModelId}`);
                return model;
            }
        }
        
        // Fallback 3: 使用任何可用的模型
        const allModels = this.modelDiscovery.getAllModels();
        if (allModels.length > 0) {
            logger.info(`🔄 Fallback to first available model: ${allModels[0].id}`);
            return allModels[0];
        }
        
        return null;
    }
    
    /**
     * 检查 Copilot 访问
     */
    private async checkCopilotAccess(): Promise<boolean> {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            return models.length > 0;
        } catch (error) {
            logger.warn('Copilot access check failed:', { error: String(error) });
            return false;
        }
    }
    
    /**
     * 处理 VS Code 语言模型错误
     */
    private handleLanguageModelError(
        error: vscode.LanguageModelError,
        res: http.ServerResponse
    ): void {
        let statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR;
        let errorType: string = 'api_error';
        let message = error.message;
        
        switch (error.code) {
            case 'NoPermissions':
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorType = 'permission_error';
                message = 'Permission denied for language model access';
                break;
            case 'Blocked':
                statusCode = HTTP_STATUS.FORBIDDEN;
                errorType = 'permission_error';
                message = 'Request blocked by content filter';
                break;
            case 'NotFound':
                statusCode = HTTP_STATUS.NOT_FOUND;
                errorType = 'not_found_error';
                message = 'Language model not found';
                break;
            case 'ContextLengthExceeded':
                statusCode = HTTP_STATUS.BAD_REQUEST;
                errorType = 'invalid_request_error';
                message = 'Request exceeds context length limit';
                break;
            default:
                statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
                errorType = 'api_error';
                message = `Language model error: ${error.message}`;
        }
        
        this.sendErrorResponse(res, statusCode, errorType, message);
    }
    
    /**
     * 发送错误响应
     */
    private sendErrorResponse(
        res: http.ServerResponse,
        statusCode: number,
        type: string,
        message: string
    ): void {
        if (res.headersSent) {
            return;
        }
        
        const errorResponse = AnthropicConverter.createErrorResponse(type, message);
        
        res.writeHead(statusCode, { 'Content-Type': CONTENT_TYPES.JSON });
        res.end(JSON.stringify(errorResponse, null, 2));
    }
    
    /**
     * 读取请求体
     */
    private async readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            
            req.on('data', chunk => {
                body += chunk;
                
                // 限制请求体大小
                if (body.length > 10 * 1024 * 1024) { // 10MB
                    reject(new Error('Request body too large'));
                    return;
                }
            });
            
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }
}
