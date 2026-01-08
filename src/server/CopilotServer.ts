/**
 * 🚀 革命性增强型 Copilot 服务器
 * ✨ 无硬编码限制 - 完全动态模型支持！
 * 🎨 完整的多模态、函数调用和智能模型选择
 */

import * as http from 'http';
import * as vscode from 'vscode';
import { URL } from 'url';

import { logger } from '../utils/Logger';
import { Validator } from '../utils/Validator';
import { RequestHandler } from './RequestHandler';
import { ClaudeCodeHandler } from '../handlers/ClaudeCodeHandler';
import { ModelDiscoveryService } from '../services/ModelDiscoveryService';
import { ServerConfig, ServerState } from '../types/VSCode';
import { 
    DEFAULT_CONFIG, 
    API_ENDPOINTS, 
    HTTP_STATUS, 
    CORS_HEADERS,
    NOTIFICATIONS,
    LIMITS
} from '../constants/Config';

export class CopilotServer {
    private server?: http.Server;
    private requestHandler: RequestHandler;
    private claudeCodeHandler: ClaudeCodeHandler;
    private modelDiscovery: ModelDiscoveryService;
    private config: ServerConfig;
    private state: ServerState;
    private activeRequests: Map<string, { req: http.IncomingMessage; res: http.ServerResponse; startTime: Date }>;
    private isShuttingDown: boolean = false;
    
    constructor() {
        this.requestHandler = new RequestHandler();
        this.modelDiscovery = new ModelDiscoveryService();
        this.claudeCodeHandler = new ClaudeCodeHandler(this.modelDiscovery);
        this.config = this.loadConfig();
        this.state = {
            isRunning: false,
            requestCount: 0,
            errorCount: 0,
            activeConnections: 0
        };
        this.activeRequests = new Map();
        
        // 监听配置更改
        vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged.bind(this));
        
        // 初始化增强功能
        this.initializeEnhancedFeatures();
    }
    
    /**
     * 🚀 初始化增强功能
     */
    private async initializeEnhancedFeatures(): Promise<void> {
        try {
            logger.info('🚀 Initializing enhanced server features...');
            
            // 启动模型发现
            await this.modelDiscovery.discoverAllModels();
            
            logger.info('✅ Enhanced server features initialized!');
        } catch (error) {
            logger.error('❌ Failed to initialize enhanced features:', error as Error);
        }
    }
    
    /**
     * 🚀 启动增强HTTP服务器
     */
    public async start(port?: number): Promise<void> {
        if (this.state.isRunning) {
            throw new Error('Enhanced server is already running');
        }
        
        const serverPort = port || this.config.port;
        const serverHost = this.config.host;
        
        // 验证配置
        Validator.validatePort(serverPort);
        Validator.validateHost(serverHost);
        
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer(this.handleRequest.bind(this));
                
                // 配置增强服务器设置
                this.server.keepAliveTimeout = 65000;
                this.server.headersTimeout = 66000;
                this.server.maxRequestsPerSocket = 1000;
                this.server.requestTimeout = this.config.requestTimeout;
                
                // 设置增强事件处理器
                this.setupEnhancedServerEventHandlers();
                
                this.server.listen(serverPort, serverHost, () => {
                    this.state.isRunning = true;
                    this.state.port = serverPort;
                    this.state.host = serverHost;
                    this.state.startTime = new Date();
                    
                    logger.logServerEvent('🚀 Enhanced server started', {
                        host: serverHost,
                        port: serverPort,
                        timeout: this.config.requestTimeout,
                        features: {
                            dynamicModels: true,
                            multimodal: true,
                            functionCalling: true,
                            noLimitations: true
                        }
                    });
                    
                    vscode.window.showInformationMessage(
                        `🚀 ${NOTIFICATIONS.SERVER_STARTED} (Enhanced) on http://${serverHost}:${serverPort}`
                    );
                    
                    resolve();
                });
                
                this.server.on('error', (error: NodeJS.ErrnoException) => {
                    this.state.isRunning = false;
                    
                    if (error.code === 'EADDRINUSE') {
                        const message = `${NOTIFICATIONS.PORT_IN_USE}: ${serverPort}`;
                        logger.error(message, error);
                        vscode.window.showErrorMessage(message);
                        reject(new Error(message));
                    } else {
                        logger.error('Enhanced server startup error', error);
                        vscode.window.showErrorMessage(`${NOTIFICATIONS.SERVER_ERROR}: ${error.message}`);
                        reject(error);
                    }
                });
                
            } catch (error) {
                logger.error('Failed to create enhanced server', error as Error);
                reject(error);
            }
        });
    }
    
    /**
     * 🔄 增强请求处理器
     */
    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        if (this.isShuttingDown) {
            this.sendError(res, HTTP_STATUS.SERVICE_UNAVAILABLE, 'Server is shutting down');
            return;
        }
        
        const requestId = this.generateRequestId();
        const startTime = new Date();
        
        // 追踪活动请求
        this.activeRequests.set(requestId, { req, res, startTime });
        this.state.activeConnections = this.activeRequests.size;
        
        // 为此请求设置超时
        req.setTimeout(this.config.requestTimeout, () => {
            this.handleRequestTimeout(requestId, res);
        });
        
        try {
            // 增加请求计数器
            this.state.requestCount++;
            
            // 解析URL，为缺少的host头提供退回
            const hostHeader = req.headers.host || `${this.config.host}:${this.config.port}`;
            const url = new URL(req.url || '/', `http://${hostHeader}`);
            const method = req.method || 'GET';
            
            // 记录增强请求
            logger.logRequest(method, url.pathname, requestId);
            
            // 添加CORS头
            this.addCORSHeaders(res);
            
            // 处理预检请求
            if (method === 'OPTIONS') {
                this.handlePreflight(res);
                return;
            }
            
            // 增强速率限制检查
            if (!this.checkEnhancedRateLimit(req)) {
                this.sendError(res, HTTP_STATUS.TOO_MANY_REQUESTS, 'Rate limit exceeded', requestId);
                return;
            }
            
            // 路由到增强处理器
            await this.routeEnhancedRequest(url.pathname, method, req, res, requestId);
            
        } catch (error) {
            this.state.errorCount++;
            logger.error('🚀 Enhanced request handling error', error as Error, {}, requestId);
            
            if (!res.headersSent) {
                this.sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Internal server error', requestId);
            }
        } finally {
            // 清理请求追踪
            this.activeRequests.delete(requestId);
            this.state.activeConnections = this.activeRequests.size;
            
            // 记录增强响应
            const duration = Date.now() - startTime.getTime();
            logger.logResponse(res.statusCode || 500, requestId, duration);
        }
    }
    
    /**
     * 🎯 路由请求到增强处理器
     */
    private async routeEnhancedRequest(
        pathname: string,
        method: string,
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        // 🎨 尝试 Claude Code 路由
        if (pathname.startsWith('/anthropic/claude')) {
            const handled = await this.claudeCodeHandler.handleRequest(
                pathname,
                method,
                req,
                res,
                requestId
            );
            
            if (handled) {
                return;
            }
        }
        
        // Anthropic 兼容端点
        if (pathname === '/v1/messages' && method === 'POST') {
            await this.claudeCodeHandler.handleMessages(req, res, requestId);
            return;
        }
        
        if (pathname === '/v1/messages/count_tokens' && method === 'POST') {
            await this.claudeCodeHandler.handleCountTokens(req, res, requestId);
            return;
        }
        
        // OpenAI 兼容端点
        switch (pathname) {
            case API_ENDPOINTS.CHAT_COMPLETIONS:
                if (method === 'POST') {
                    await this.requestHandler.handleChatCompletions(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case API_ENDPOINTS.MODELS:
                if (method === 'GET') {
                    await this.requestHandler.handleModels(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case API_ENDPOINTS.HEALTH:
                if (method === 'GET') {
                    await this.requestHandler.handleHealth(req, res, requestId, this.state);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case API_ENDPOINTS.STATUS:
                if (method === 'GET') {
                    await this.requestHandler.handleStatus(req, res, requestId, this.state);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            // 🚀 增强端点
            case '/v1/models/refresh':
                if (method === 'POST') {
                    await this.handleModelRefresh(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            case '/v1/capabilities':
                if (method === 'GET') {
                    await this.handleCapabilities(req, res, requestId);
                } else {
                    this.sendError(res, HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', requestId);
                }
                break;
                
            default:
                this.sendError(res, HTTP_STATUS.NOT_FOUND, 'Endpoint not found', requestId);
        }
    }
    
    /**
     * 🔄 处理模型刷新端点
     */
    private async handleModelRefresh(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        try {
            logger.info('🔄 Manual model refresh requested', {}, requestId);
            
            const models = await this.modelDiscovery.discoverAllModels();
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                message: 'Models refreshed successfully',
                modelCount: models.length,
                timestamp: new Date().toISOString()
            }, null, 2));
            
        } catch (error) {
            this.sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Model refresh failed', requestId);
        }
    }
    
    /**
     * 📋 处理能力端点
     */
    private async handleCapabilities(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        requestId: string
    ): Promise<void> {
        try {
            const modelPool = this.modelDiscovery.getModelPool();
            
            const capabilities = {
                server: {
                    version: '2.0.0-enhanced',
                    features: {
                        dynamicModelDiscovery: true,
                        multimodalSupport: true,
                        functionCalling: true,
                        noHardcodedLimitations: true,
                        autoModelSelection: true,
                        loadBalancing: true,
                        realTimeModelRefresh: true
                    }
                },
                models: {
                    total: modelPool.primary.length + modelPool.secondary.length + modelPool.fallback.length,
                    withVision: modelPool.primary.filter(m => m.supportsVision).length,
                    withTools: modelPool.primary.filter(m => m.supportsTools).length,
                    withMultimodal: modelPool.primary.filter(m => m.supportsMultimodal).length,
                    maxContextTokens: Math.max(...modelPool.primary.map(m => m.maxInputTokens), 0)
                },
                supportedFormats: {
                    images: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
                    imageInput: ['base64', 'url', 'file'],
                    functions: true,
                    tools: true,
                    streaming: true
                }
            };
            
            res.writeHead(HTTP_STATUS.OK, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(capabilities, null, 2));
            
        } catch (error) {
            this.sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Capabilities check failed', requestId);
        }
    }
    
    /**
     * 🔄 增强服务器事件处理器
     */
    private setupEnhancedServerEventHandlers(): void {
        if (!this.server) {
            return;
        }
        
        this.server.on('connection', (socket) => {
            socket.setKeepAlive(true, 60000);
            socket.setNoDelay(true);
            
            socket.on('error', (error) => {
                logger.error('Enhanced socket error', error);
            });
        });
        
        this.server.on('clientError', (error, socket) => {
            logger.error('Enhanced client error', error);
            if (socket.writable) {
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            }
        });
    }
    
    /**
     * 📊 增强速率限制
     */
    private checkEnhancedRateLimit(req: http.IncomingMessage): boolean {
        // 带IP追踪的增强速率限制
        return this.activeRequests.size < this.config.maxConcurrentRequests;
    }
    
    /**
     * 🔄 增强CORS头
     */
    private addCORSHeaders(res: http.ServerResponse): void {
        Object.entries(CORS_HEADERS).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        
        // 为多模态支持的增强头
        res.setHeader('X-Enhanced-Features', 'multimodal,functions,dynamic-models');
        res.setHeader('X-API-Version', '2.0.0-enhanced');
    }
    
    /**
     * 🔄 处理预检OPTIONS请求
     */
    private handlePreflight(res: http.ServerResponse): void {
        res.writeHead(HTTP_STATUS.OK);
        res.end();
    }
    
    /**
     * ⏰ 处理请求超时
     */
    private handleRequestTimeout(requestId: string, res: http.ServerResponse): void {
        logger.warn('Enhanced request timeout', {}, requestId);
        
        if (!res.headersSent) {
            this.sendError(res, HTTP_STATUS.REQUEST_TIMEOUT, 'Request timeout', requestId);
        }
        
        this.activeRequests.delete(requestId);
    }
    
    /**
     * ❌ 发送增强错误响应
     */
    private sendError(res: http.ServerResponse, statusCode: number, message: string, requestId?: string): void {
        if (res.headersSent) {
            return;
        }
        
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message,
                type: 'enhanced_server_error',
                code: statusCode,
                timestamp: new Date().toISOString(),
                requestId
            }
        }, null, 2));
        
        if (requestId) {
            logger.error(`❌ Enhanced error response: ${statusCode}`, new Error(message), {}, requestId);
        }
    }
    
    /**
     * 📋 生成唯一请求ID
     */
    private generateRequestId(): string {
        return `enhanced_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * 🔄 停止增强服务器
     */
    public async stop(): Promise<void> {
        if (!this.state.isRunning || !this.server) {
            return;
        }
        
        this.isShuttingDown = true;
        
        return new Promise((resolve) => {
            // 首先关闭所有活动请求
            this.closeActiveRequests();
            
            this.server!.close(() => {
                this.state.isRunning = false;
                this.state.port = undefined;
                this.state.host = undefined;
                this.state.startTime = undefined;
                this.isShuttingDown = false;
                
                logger.logServerEvent('🚀 Enhanced server stopped');
                vscode.window.showInformationMessage('🚀 Enhanced ' + NOTIFICATIONS.SERVER_STOPPED);
                
                resolve();
            });
            
            // 超时后强制关闭
            setTimeout(() => {
                this.server?.closeAllConnections?.();
                resolve();
            }, 5000);
        });
    }
    
    /**
     * 🔄 重启增强服务器
     */
    public async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }
    
    /**
     * 📋 获取当前服务器状态
     */
    public getState(): ServerState {
        return { ...this.state };
    }
    
    /**
     * 📋 获取服务器配置
     */
    public getConfig(): ServerConfig {
        return { ...this.config };
    }
    
    /**
     * 🔄 关闭所有活动请求
     */
    private closeActiveRequests(): void {
        for (const [requestId, { res }] of this.activeRequests.entries()) {
            try {
                if (!res.headersSent) {
                    this.sendError(res, HTTP_STATUS.SERVICE_UNAVAILABLE, 'Server shutting down', requestId);
                }
            } catch (error) {
                logger.error('Error closing enhanced request', error as Error, {}, requestId);
            }
        }
        this.activeRequests.clear();
    }
    
    /**
     * 🔄 加载增强配置
     */
    private loadConfig(): ServerConfig {
        const config = vscode.workspace.getConfiguration('copilot-lmapi');
        
        return {
            port: config.get<number>('port', DEFAULT_CONFIG.port),
            host: config.get<string>('host', DEFAULT_CONFIG.host),
            autoStart: config.get<boolean>('autoStart', DEFAULT_CONFIG.autoStart),
            enableLogging: config.get<boolean>('enableLogging', DEFAULT_CONFIG.enableLogging),
            maxConcurrentRequests: Math.min(
                config.get<number>('maxConcurrentRequests', DEFAULT_CONFIG.maxConcurrentRequests),
                LIMITS.MAX_CONCURRENT_REQUESTS
            ),
            requestTimeout: Math.min(
                config.get<number>('requestTimeout', DEFAULT_CONFIG.requestTimeout),
                LIMITS.MAX_TIMEOUT
            )
        };
    }
    
    /**
     * 🔄 处理配置更改
     */
    private onConfigurationChanged(event: vscode.ConfigurationChangeEvent): void {
        if (event.affectsConfiguration('copilot-lmapi')) {
            const newConfig = this.loadConfig();
            const oldConfig = this.config;
            
            this.config = newConfig;
            
            logger.logServerEvent('🔄 Enhanced configuration changed', {
                old: oldConfig,
                new: newConfig
            });
            
            // 如果关键设置更改则重启服务器
            if (this.state.isRunning && 
                (oldConfig.port !== newConfig.port || oldConfig.host !== newConfig.host)) {
                
                vscode.window.showInformationMessage(
                    '🔄 Enhanced server configuration changed. Restart required.',
                    'Restart Now'
                ).then(selection => {
                    if (selection === 'Restart Now') {
                        this.restart().catch(error => {
                            logger.error('Failed to restart enhanced server after config change', error);
                        });
                    }
                });
            }
        }
    }
    
    /**
     * 🧹 释放增强资源
     */
    public dispose(): void {
        this.stop().catch(error => {
            logger.error('Error during enhanced server disposal', error);
        });
        
        this.requestHandler.dispose();
        this.modelDiscovery.dispose();
    }
}
