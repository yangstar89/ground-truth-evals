#!/usr/bin/env node
/**
 * poker-oracle MCP server, over stdio.
 *
 *   claude mcp add poker-oracle -- node /path/to/poker-agent-evals/examples/poker/mcp-server.mjs
 *
 * stdout carries the protocol, so nothing here may print to it; anything
 * diagnostic goes to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp/server.js';

try {
  await createServer().connect(new StdioServerTransport());
} catch (e) {
  console.error(`poker-oracle: ${e.stack ?? e}`);
  process.exit(1);
}
