import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ConnectorManifest } from "./manifest";
import { InvalidInputError, NotFoundError, publicError } from "./errors";
import { consoleLogger, type Logger } from "./logging";

export interface ConnectorTool {
  name: string;
  restPath?: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  outputSchema?: z.ZodType;
  execute(input: unknown): Promise<unknown>;
}

export interface Connector {
  manifest: ConnectorManifest;
  tools: readonly ConnectorTool[];
  healthCheck(): Promise<boolean>;
}

export async function invokeTool(
  connector: Connector,
  toolName: string,
  input: unknown,
  options: { logger?: Logger; requestId?: string } = {},
): Promise<unknown> {
  const logger = options.logger ?? consoleLogger;
  const requestId = options.requestId ?? randomUUID();
  const started = performance.now();
  let errorCode: string | undefined;

  try {
    const tool = connector.tools.find((item) => item.name === toolName);
    if (!tool) throw new NotFoundError("Tool not found.");
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) throw new InvalidInputError("Tool input failed validation.");
    const result = await tool.execute(parsed.data);
    if (tool.outputSchema) {
      return tool.outputSchema.parse(result);
    }
    return result;
  } catch (error) {
    errorCode = publicError(error).code;
    throw error;
  } finally {
    logger.log({
      event: "connector_invocation",
      requestId,
      connector: connector.manifest.id,
      tool: toolName,
      durationMs: Math.round(performance.now() - started),
      success: errorCode === undefined,
      ...(errorCode ? { errorCode } : {}),
    });
  }
}
