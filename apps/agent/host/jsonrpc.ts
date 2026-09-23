/**
 * Minimal JSON-RPC 2.0 types and helpers for the local stdio bridge.
 * Framing: one complete JSON message per line (NDJSON); string newlines stay
 * escaped inside JSON. A single inbound message is capped (ARCHITECTURE §7).
 * This module knows nothing about MCP semantics or the analysis domain.
 */
export const MAX_MESSAGE_BYTES = 1024 * 1024;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

export interface JsonRpcError { code: number; message: string; data?: unknown }
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class JsonRpcErrorResult extends Error {
  constructor(public readonly code: number, message: string, public readonly data?: unknown) {
    super(message);
    this.name = 'JsonRpcErrorResult';
  }
}

export const isRequest = (message: JsonRpcMessage): message is JsonRpcRequest => 'id' in message && message.id !== undefined;

export function parseMessage(line: string): JsonRpcMessage {
  if (Buffer.byteLength(line, 'utf8') > MAX_MESSAGE_BYTES)
    throw new JsonRpcErrorResult(PARSE_ERROR, '消息超过 1MB 上限，已拒绝。');
  let value: unknown;
  try { value = JSON.parse(line); }
  catch { throw new JsonRpcErrorResult(PARSE_ERROR, '不是合法 JSON。'); }
  if (!value || typeof value !== 'object' || (value as { jsonrpc?: unknown }).jsonrpc !== '2.0' || typeof (value as { method?: unknown }).method !== 'string')
    throw new JsonRpcErrorResult(INVALID_REQUEST, '不是合法的 JSON-RPC 2.0 消息。');
  const message = value as JsonRpcMessage;
  if (isRequest(message) && typeof message.id !== 'number' && typeof message.id !== 'string')
    throw new JsonRpcErrorResult(INVALID_REQUEST, '请求 id 必须是字符串或数字。');
  return message;
}

export function resultResponse(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function errorResponse(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function errorFrom(id: number | string | null, error: unknown): JsonRpcResponse {
  if (error instanceof JsonRpcErrorResult) return errorResponse(id, error.code, error.message, error.data);
  return errorResponse(id, INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
}
