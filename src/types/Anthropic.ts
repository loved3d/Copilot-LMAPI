/**
 * Anthropic Claude API Type Definitions
 * Compatible with Claude Code and Anthropic Messages API
 */

// Content block types
export interface TextContent {
    type: 'text';
    text: string;
}

export interface ImageContent {
    type: 'image';
    source: {
        type: 'base64' | 'url';
        media_type: string;
        data: string;
    };
}

export interface ToolUseContent {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, any>;
}

export interface ToolResultContent {
    type: 'tool_result';
    tool_use_id: string;
    content: string | TextContent[];
    is_error?: boolean;
}

export type ContentBlock = TextContent | ImageContent | ToolUseContent | ToolResultContent;

// Message structure
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

// Tool/Function definition
export interface AnthropicTool {
    name: string;
    description?: string;
    input_schema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

// Request structure
export interface AnthropicMessagesRequest {
    model: string;
    messages: AnthropicMessage[];
    max_tokens: number;
    system?: string | TextContent[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stream?: boolean;
    stop_sequences?: string[];
    metadata?: {
        user_id?: string;
    };
    tools?: AnthropicTool[];
}

// Count tokens request
export interface AnthropicCountTokensRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string | TextContent[];
    tools?: AnthropicTool[];
}

// Usage information
export interface AnthropicUsage {
    input_tokens: number;
    output_tokens: number;
}

// Response structure
export interface AnthropicMessagesResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
    stop_sequence?: string | null;
    usage: AnthropicUsage;
}

// Count tokens response
export interface AnthropicCountTokensResponse {
    input_tokens: number;
}

// Streaming event types
export interface MessageStartEvent {
    type: 'message_start';
    message: {
        id: string;
        type: 'message';
        role: 'assistant';
        content: [];
        model: string;
        stop_reason: null;
        stop_sequence: null;
        usage: {
            input_tokens: number;
            output_tokens: number;
        };
    };
}

export interface ContentBlockStartEvent {
    type: 'content_block_start';
    index: number;
    content_block: {
        type: 'text';
        text: string;
    } | {
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, any>;
    };
}

export interface ContentBlockDeltaEvent {
    type: 'content_block_delta';
    index: number;
    delta: {
        type: 'text_delta';
        text: string;
    } | {
        type: 'input_json_delta';
        partial_json: string;
    };
}

export interface ContentBlockStopEvent {
    type: 'content_block_stop';
    index: number;
}

export interface MessageDeltaEvent {
    type: 'message_delta';
    delta: {
        stop_reason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
        stop_sequence?: string | null;
    };
    usage: {
        output_tokens: number;
    };
}

export interface MessageStopEvent {
    type: 'message_stop';
}

export interface PingEvent {
    type: 'ping';
}

export interface ErrorEvent {
    type: 'error';
    error: {
        type: string;
        message: string;
    };
}

export type AnthropicStreamEvent =
    | MessageStartEvent
    | ContentBlockStartEvent
    | ContentBlockDeltaEvent
    | ContentBlockStopEvent
    | MessageDeltaEvent
    | MessageStopEvent
    | PingEvent
    | ErrorEvent;

// Model information
export interface AnthropicModel {
    id: string;
    type: 'model';
    display_name: string;
    created_at: string;
}

export interface AnthropicModelsResponse {
    data: AnthropicModel[];
    has_more: boolean;
    first_id?: string;
    last_id?: string;
}

// Error response
export interface AnthropicErrorResponse {
    type: 'error';
    error: {
        type: string;
        message: string;
    };
}
