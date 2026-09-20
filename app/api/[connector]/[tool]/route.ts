import { registry } from "@/connectors";
import { handleRestTool } from "@/platform/rest";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ connector: string; tool: string }> },
): Promise<Response> {
  const { connector, tool } = await context.params;
  return handleRestTool(request, registry, connector, tool);
}
