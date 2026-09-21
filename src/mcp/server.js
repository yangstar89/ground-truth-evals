/**
 * The poker oracle as an MCP server.
 *
 * Built on the SDK's low-level Server rather than McpServer, for one reason:
 * McpServer validates arguments before a tool runs and rejects bad ones as a
 * protocol error. The MCP spec asks for tool errors to come back inside the
 * result, with isError set, so the model sees them and can correct itself -
 * and a protocol error may never reach the model at all. Publishing the JSON
 * schemas directly and validating inside the tool keeps every refusal
 * readable, with the "valid: ..." message that makes one retry enough.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, callTool } from './tools.js';

export function createServer() {
  const server = new Server(
    { name: 'poker-oracle', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Exact poker arithmetic: hand equity, tournament ICM, preflop chart actions. ' +
        'Call these instead of estimating; the results are computed, not recalled.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const { value, error } = callTool(params.name, params.arguments);
    if (error) return { content: [{ type: 'text', text: error }], isError: true };
    return { content: [{ type: 'text', text: JSON.stringify(value) }] };
  });

  return server;
}
