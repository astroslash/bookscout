import type { ConnectorRegistry } from "./registry";
import { invokeTool } from "./connector";
import { errorBody, InvalidInputError, publicError } from "./errors";

export async function handleRestTool(
  request: Request,
  registry: ConnectorRegistry,
  connectorId: string,
  toolName: string,
): Promise<Response> {
  try {
    const connector = registry.get(connectorId);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new InvalidInputError("Request body must be valid JSON.");
    }
    const result = await invokeTool(connector, toolName, body, {
      requestId: request.headers.get("x-request-id") ?? undefined,
    });
    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json(errorBody(error), { status: publicError(error).status });
  }
}
