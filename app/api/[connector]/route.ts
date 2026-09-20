import { registry } from "@/connectors";
import { errorBody, publicError } from "@/platform/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ connector: string }> },
): Promise<Response> {
  try {
    const { connector: id } = await context.params;
    const connector = registry.get(id);
    return Response.json({
      success: true,
      data: {
        manifest: connector.manifest,
        tools: connector.tools.map(({ name, description }) => ({ name, description })),
        healthy: await connector.healthCheck(),
      },
    });
  } catch (error) {
    return Response.json(errorBody(error), { status: publicError(error).status });
  }
}
