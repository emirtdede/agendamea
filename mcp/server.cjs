#!/usr/bin/env node
'use strict';

/**
 * Agendamea MCP Server Entrypoint & Facade (JSON-RPC 2.0 over stdio / Streamable HTTP).
 * Delegates schemas, resources/prompts, tool execution, RPC routing, and stdio framing
 * to dedicated cohesive modules under `mcp/`.
 */

const { TOOLS, STATIC_RESOURCES, RESOURCE_TEMPLATES, PROMPTS } = require('./toolSchemas.cjs');
const { readResource, getPrompt } = require('./resources.cjs');
const { executeTool } = require('./toolExecutor.cjs');
const {
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  handleJsonRpcRequest,
  createMcpHandler,
} = require('./rpcRouter.cjs');
const { startMcpServer } = require('./stdioTransport.cjs');

if (require.main === module) {
  startMcpServer();
}

module.exports = {
  TOOLS,
  STATIC_RESOURCES,
  RESOURCE_TEMPLATES,
  PROMPTS,
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  executeTool,
  readResource,
  getPrompt,
  handleJsonRpcRequest,
  createMcpHandler,
  startMcpServer,
};
