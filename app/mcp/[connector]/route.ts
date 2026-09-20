import { registry } from "@/connectors";
import { createConnectorMcpHandler } from "@/platform/mcp";
import { errorBody, publicError } from "@/platform/errors";

export const runtime = "nodejs";

type Context = { params: Promise<{ connector: string }> };

async function handle(request: Request, context: Context): Promise<Response> {
  try {
    const { connector } = await context.params;
    return createConnectorMcpHandler(registry.get(connector)).fetch(request);
  } catch (error) {
    return Response.json(errorBody(error), { status: publicError(error).status });
  }
}

export { handle as POST, handle as GET, handle as DELETE };
