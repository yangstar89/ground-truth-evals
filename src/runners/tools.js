/**
 * The harness's side of MCP: connect to a tool server, list what it offers,
 * and call it on the model's behalf.
 *
 * The with-tools run goes through a real MCP server over stdio rather than
 * calling the oracle functions directly. That is the point of the run: the
 * question is whether a model can use tools it has only been handed a schema
 * for, and a direct function call would skip the part being measured.
 *
 * The server is spawned without `env`, so it inherits only the SDK's minimal
 * default environment. API keys in this process never reach it.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Text a model can read from one tool result. Structured content is shown as
 * JSON when a server sends no text of its own, so nothing a server returns is
 * silently dropped.
 */
function resultText(result) {
  const text = (result.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  if (text) return text;
  return result.structuredContent ? JSON.stringify(result.structuredContent) : '';
}

/**
 * Spawn a server from a command line such as "node bin/mcp-server.mjs" and
 * return its tools, plus a `call` that never throws: a failing tool is
 * reported back to the model as an error result, which is what MCP intends
 * and what lets a model recover from a bad argument.
 */
export async function connectTools(commandLine, { cwd = process.cwd() } = {}) {
  const [command, ...args] = commandLine.trim().split(/\s+/);
  const transport = new StdioClientTransport({ command, args, cwd, stderr: 'pipe' });
  const client = new Client({ name: 'poker-agent-evals', version: '0.1.0' });
  await client.connect(transport);

  const tools = [];
  let cursor;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  return {
    command: commandLine,
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description: description ?? '', inputSchema })),
    async call(name, args) {
      try {
        const result = await client.callTool({ name, arguments: args ?? {} });
        return { text: resultText(result), isError: Boolean(result.isError) };
      } catch (e) {
        return { text: `tool call failed: ${e.message ?? e}`, isError: true };
      }
    },
    close: () => client.close(),
  };
}
