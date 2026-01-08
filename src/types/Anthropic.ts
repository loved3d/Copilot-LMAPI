/**
 * Anthropic/Claude API 类型定义
 * 用于 Claude Code 兼容性
 */

/**
 * Anthropic 消息角色
 */
export type AnthropicRole = 'user' | 'assistant';

/**
 * Anthropic 内容块类型
 */
export interface AnthropicTextContent {
    type: 'text';
    text: string;
}

export interface AnthropicImageContent {
    type: 'image';
    source: {
        type: 'base64' | 'url';
        media_type: string;
        data?: string;
        url?: string;
    };
}

export interface AnthropicToolUseContent {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, any>;
}

export interface AnthropicToolResultContent {
    type: 'tool_result';
    tool_use_id: string;
    content: string | Array<AnthropicTextContent | AnthropicImageContent>;
    is_error?: boolean;
}

export type AnthropicContentBlock = 
    | AnthropicTextContent 
    | AnthropicImageContent 
    | AnthropicToolUseContent 
    | AnthropicToolResultContent;

/**
 * Anthropic 消息
 */
export interface AnthropicMessage {
    role: AnthropicRole;
    content: string | AnthropicContentBlock[];
}

/**
 * Anthropic 工具定义
 */
export interface AnthropicTool {
    name: string;
    description?: string;
    input_schema: {
        type: 'object';
        properties?: Record<string, any>;
        required?: string[];
    };
}

/**
 * Anthropic 消息请求
 */
export interface AnthropicMessagesRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string | Array<{ type: 'text'; text: string; cache_control?: any }>;
    max_tokens: number;
    metadata?: {
        user_id?: string;
    };
    stop_sequences?: string[];
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    tools?: AnthropicTool[];
    tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
}

/**
 * Anthropic 使用情况统计
 */
export interface AnthropicUsage {
    input_tokens: number;
    output_tokens: number;
}

/**
 * Anthropic 消息响应
 */
export interface AnthropicMessagesResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContentBlock[];
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
    stop_sequence?: string | null;
    usage: AnthropicUsage;
}

/**
 * Anthropic 流式响应事件类型
 */
export type AnthropicStreamEventType =
    | 'message_start'
    | 'content_block_start'
    | 'content_block_delta'
    | 'content_block_stop'
    | 'message_delta'
    | 'message_stop'
    | 'ping'
    | 'error';

/**
 * Anthropic 流式响应基础事件
 */
export interface AnthropicStreamEventBase {
    type: AnthropicStreamEventType;
}

/**
 * Anthropic message_start 事件
 */
export interface AnthropicMessageStartEvent extends AnthropicStreamEventBase {
    type: 'message_start';
    message: {
        id: string;
        type: 'message';
        role: 'assistant';
        content: [];
        model: string;
        stop_reason: null;
        stop_sequence: null;
        usage: AnthropicUsage;
    };
}

/**
 * Anthropic content_block_start 事件
 */
export interface AnthropicContentBlockStartEvent extends AnthropicStreamEventBase {
    type: 'content_block_start';
    index: number;
    content_block: AnthropicContentBlock;
}

/**
 * Anthropic content_block_delta 事件
 */
export interface AnthropicContentBlockDeltaEvent extends AnthropicStreamEventBase {
    type: 'content_block_delta';
    index: number;
    delta: {
        type: 'text_delta' | 'input_json_delta';
        text?: string;
        partial_json?: string;
    };
}

/**
 * Anthropic content_block_stop 事件
 */
export interface AnthropicContentBlockStopEvent extends AnthropicStreamEventBase {
    type: 'content_block_stop';
    index: number;
}

/**
 * Anthropic message_delta 事件
 */
export interface AnthropicMessageDeltaEvent extends AnthropicStreamEventBase {
    type: 'message_delta';
    delta: {
        stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
        stop_sequence?: string | null;
    };
    usage: {
        output_tokens: number;
    };
}

/**
 * Anthropic message_stop 事件
 */
export interface AnthropicMessageStopEvent extends AnthropicStreamEventBase {
    type: 'message_stop';
}

/**
 * Anthropic ping 事件
 */
export interface AnthropicPingEvent extends AnthropicStreamEventBase {
    type: 'ping';
}

/**
 * Anthropic error 事件
 */
export interface AnthropicErrorEvent extends AnthropicStreamEventBase {
    type: 'error';
    error: {
        type: string;
        message: string;
    };
}

export type AnthropicStreamEvent = 
    | AnthropicMessageStartEvent
    | AnthropicContentBlockStartEvent
    | AnthropicContentBlockDeltaEvent
    | AnthropicContentBlockStopEvent
    | AnthropicMessageDeltaEvent
    | AnthropicMessageStopEvent
    | AnthropicPingEvent
    | AnthropicErrorEvent;

/**
 * Anthropic 错误响应
 */
export interface AnthropicError {
    type: string;
    message: string;
}

export interface AnthropicErrorResponse {
    type: 'error';
    error: AnthropicError;
}

/**
 * Anthropic 模型信息
 */
export interface AnthropicModel {
    id: string;
    type: 'model';
    display_name: string;
    created_at: string;
}

/**
 * Anthropic 模型列表响应
 */
export interface AnthropicModelsResponse {
    data: AnthropicModel[];
    has_more: boolean;
    first_id: string | null;
    last_id: string | null;
}

/**
 * Anthropic count_tokens 请求
 */
export interface AnthropicCountTokensRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string;
    tools?: AnthropicTool[];
}

/**
 * Anthropic count_tokens 响应
 */
export interface AnthropicCountTokensResponse {
    input_tokens: number;
}
