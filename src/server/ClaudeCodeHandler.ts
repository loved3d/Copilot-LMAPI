/**
 * Claude Code Handler
 * Handles Claude Code / Anthropic Messages API compatible requests
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { logger } from '../utils/Logger';
import { AnthropicConverter } from '../utils/AnthropicConverter';
import { ModelDiscoveryService } from '../services/ModelDiscoveryService';
import { ModelCapabilities } from '../types/ModelCapabilities';
import {
    AnthropicMessagesRequest,
    AnthropicCountTokensRequest,
    AnthropicErrorResponse
} from '../types/Anthropic';
import { HTTP_STATUS, CONTENT_TYPES } from '../constants/Config';

export class ClaudeCodeHandler {
    private modelDiscovery: ModelDiscoveryService;
    
    constructor(modelDiscovery: ModelDiscoveryService) {
        this.modelDiscovery = modelDiscovery;
    }
    
    /**
     * Get model selection based on Claude Code dual-model routing
     */
    private getModelForRequest(requestedModel: string): ModelCapabilities | null {
        const config = vscode.workspace.getConfiguration('copilot-lmapi');
        
        // Get configured models
        const backgroundModelId = config.get<string>('claudeCode.backgroundModelId', '');
        const thinkingModelId = config.get<string>('claudeCode.thinkingModelId', '');
        
        // Determine which model to use based on requested model name
        let targetModelId: string;
        
        if (requestedModel.toLowerCase().includes('haiku')) {
            // Use background model for haiku requests
            targetModelId = backgroundModelId || requestedModel;
            logger.info(`Claude Code routing: haiku -> background model: ${targetModelId}`);
        } else if (requestedModel.toLowerCase().includes('sonnet') || 
                   requestedModel.toLowerCase().includes('opus')) {
            // Use thinking model for sonnet/opus requests
            targetModelId = thinkingModelId || requestedModel;
            logger.info(`Claude Code routing: sonnet/opus -> thinking model: ${targetModelId}`);
        } else {
            // Fallback to background model for unknown models
            targetModelId = backgroundModelId || requestedModel;
            logger.info(`Claude Code routing: unknown -> background model: ${targetModelId}`);
        }
        
        // Get the model from discovery service
        let selectedModel = this.modelDiscovery.getModel(targetModelId);
        
        // If not found, try the original requested model
        if (!selectedModel) {
            selectedModel = this.modelDiscovery.getModel(requestedModel);
        }
        
        return selectedModel || null;
    }
    
    /**
     * Handle POST /anthropic/claude/v1/messages
     */
    public async handleMessages(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('🤖 Processing Claude Code messages request');
            
            // Read request body
            const body = await this.readRequestBody(req);
            let request: AnthropicMessagesRequest;
            
            try {
                request = JSON.parse(body);
            } catch (parseError) {
                this.sendError(res, 400, 'invalid_request_error', 'Invalid JSON in request body');
                return;
            }
            
            // Validate required fields
            if (!request.model || !request.messages || !request.max_tokens) {
                this.sendError(res, 400, 'invalid_request_error', 'Missing required fields: model, messages, max_tokens');
                return;
            }
            
            // Select model based on dual-model routing
            const selectedModel = this.getModelForRequest(request.model);
            
            if (!selectedModel) {
                this.sendError(res, 404, 'not_found_error', `Model '${request.model}' not found`);
                return;
            }
            
            requestLogger.info('📋 Request details:', {
                requestedModel: request.model,
                selectedModel: selectedModel.id,
                stream: request.stream || false,
                maxTokens: request.max_tokens,
                messageCount: request.messages.length
            });
            
            // Convert Anthropic messages to VS Code format
            const vsCodeMessages = await AnthropicConverter.convertAnthropicToVSCode(
                request,
                selectedModel
            );
            
            // Send request to VS Code LM API
            const response = await selectedModel.vsCodeModel.sendRequest(
                vsCodeMessages,
                {},
                new vscode.CancellationTokenSource().token
            );
            
            // Handle streaming vs non-streaming response
            if (request.stream) {
                await this.handleStreamingResponse(response, res, requestId, request.model, requestLogger);
            } else {
                await this.handleNonStreamingResponse(response, res, requestId, request.model, requestLogger);
            }
            
        } catch (error) {
            requestLogger.error('❌ Error handling Claude Code messages request:', error as Error);
            
            if (!res.headersSent) {
                if (error instanceof vscode.LanguageModelError) {
                    this.handleLanguageModelError(error, res);
                } else {
                    this.sendError(res, 500, 'api_error', 'Internal server error');
                }
            }
        }
    }
    
    /**
     * Handle streaming response
     */
    private async handleStreamingResponse(
        response: vscode.LanguageModelChatResponse,
        res: http.ServerResponse,
        requestId: string,
        model: string,
        requestLogger: any
    ): Promise<void> {
        res.writeHead(HTTP_STATUS.OK, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        
        try {
            requestLogger.info('🌊 Starting Claude Code streaming response...');
            
            let chunkCount = 0;
            for await (const event of AnthropicConverter.convertVSCodeStreamToAnthropic(
                response,
                requestId,
                model
            )) {
                res.write(event);
                chunkCount++;
            }
            
            requestLogger.info(`✅ Claude Code streaming completed: ${chunkCount} events sent`);
            
        } catch (error) {
            requestLogger.error('❌ Streaming error:', error as Error);
            
            const errorResponse = AnthropicConverter.createErrorResponse('api_error', 'Stream processing error');
            const errorEvent = `event: error\ndata: ${JSON.stringify(errorResponse)}\n\n`;
            res.write(errorEvent);
        } finally {
            res.end();
        }
    }
    
    /**
     * Handle non-streaming response
     */
    private async handleNonStreamingResponse(
        response: vscode.LanguageModelChatResponse,
        res: http.ServerResponse,
        requestId: string,
        model: string,
        requestLogger: any
    ): Promise<void> {
        try {
            requestLogger.info('📋 Collecting Claude Code full response...');
            
            const anthropicResponse = await AnthropicConverter.convertVSCodeToAnthropic(
                response,
                requestId,
                model
            );
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(anthropicResponse, null, 2));
            
            requestLogger.info('✅ Claude Code response sent:', {
                contentLength: (anthropicResponse.content[0] as any)?.text?.length || 0,
                inputTokens: anthropicResponse.usage.input_tokens,
                outputTokens: anthropicResponse.usage.output_tokens
            });
            
        } catch (error) {
            requestLogger.error('❌ Error collecting response:', error as Error);
            throw error;
        }
    }
    
    /**
     * Handle POST /anthropic/claude/v1/messages/count_tokens
     */
    public async handleCountTokens(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('🔢 Processing Claude Code count tokens request');
            
            const body = await this.readRequestBody(req);
            let request: AnthropicCountTokensRequest;
            
            try {
                request = JSON.parse(body);
            } catch (parseError) {
                this.sendError(res, 400, 'invalid_request_error', 'Invalid JSON in request body');
                return;
            }
            
            // Estimate token count
            const tokenResponse = AnthropicConverter.estimateTokenCount(request as any);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(tokenResponse, null, 2));
            
            requestLogger.info('✅ Token count response sent:', tokenResponse);
            
        } catch (error) {
            requestLogger.error('❌ Error counting tokens:', error as Error);
            
            if (!res.headersSent) {
                this.sendError(res, 500, 'api_error', 'Token counting failed');
            }
        }
    }
    
    /**
     * Handle GET /anthropic/claude/v1/models
     */
    public async handleModels(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        const requestLogger = logger.createRequestLogger(requestId);
        
        try {
            requestLogger.info('📋 Fetching Claude Code models list');
            
            const allModels = this.modelDiscovery.getAllModels();
            const modelsResponse = AnthropicConverter.createModelsResponse(allModels);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(modelsResponse, null, 2));
            
            requestLogger.info(`✅ Models response sent with ${modelsResponse.data.length} models`);
            
        } catch (error) {
            requestLogger.error('❌ Error fetching models:', error as Error);
            
            if (!res.headersSent) {
                this.sendError(res, 500, 'api_error', 'Failed to retrieve models');
            }
        }
    }
    
    /**
     * Handle GET /anthropic/claude/v1/models/:model
     */
    public async handleGetModel(
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
                this.sendError(res, 404, 'not_found_error', `Model '${modelId}' not found`);
                return;
            }
            
            const modelResponse = AnthropicConverter.convertModelToAnthropic(model);
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': CONTENT_TYPES.JSON });
            res.end(JSON.stringify(modelResponse, null, 2));
            
            requestLogger.info(`✅ Model response sent for ${modelId}`);
            
        } catch (error) {
            requestLogger.error('❌ Error fetching model:', error as Error);
            
            if (!res.headersSent) {
                this.sendError(res, 500, 'api_error', 'Failed to retrieve model');
            }
        }
    }
    
    /**
     * Handle VS Code Language Model errors
     */
    private handleLanguageModelError(
        error: vscode.LanguageModelError,
        res: http.ServerResponse
    ): void {
        let statusCode = 500;
        let errorType = 'api_error';
        let message = error.message;
        
        switch (error.code) {
            case 'NoPermissions':
                statusCode = 403;
                errorType = 'permission_error';
                message = 'Permission denied for language model access';
                break;
            case 'Blocked':
                statusCode = 403;
                errorType = 'permission_error';
                message = 'Request blocked by content filter';
                break;
            case 'NotFound':
                statusCode = 404;
                errorType = 'not_found_error';
                message = 'Language model not found';
                break;
            case 'ContextLengthExceeded':
                statusCode = 400;
                errorType = 'invalid_request_error';
                message = 'Request exceeds context length limit';
                break;
        }
        
        this.sendError(res, statusCode, errorType, message);
    }
    
    /**
     * Send error response in Anthropic format
     */
    private sendError(
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
     * Read request body
     */
    private async readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            
            req.on('data', chunk => {
                body += chunk;
                
                if (body.length > 50 * 1024 * 1024) { // 50MB limit
                    reject(new Error('Request body too large'));
                    return;
                }
            });
            
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }
}
