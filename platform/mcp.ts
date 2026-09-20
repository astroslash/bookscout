import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { Connector } from "./connector";
import { invokeTool } from "./connector";
import { errorBody } from "./errors";

export function createConnectorMcpHandler(connector: Connector) {
  return createMcpHandler(() => {
    const server = new McpServer({
      name: connector.manifest.id,
      version: connector.manifest.version,
    });

    for (const tool of connector.tools) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        async (input) => {
          try {
            const result = await invokeTool(connector, tool.name, input);
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          } catch (error) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: JSON.stringify(errorBody(error)) }],
            };
          }
        },
      );
    }

    return server;
  });
}
