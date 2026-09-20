import { z } from "zod";

export const connectorManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1),
  examples: z.array(z.string().min(1)).default([]),
  monetization: z.enum(["none", "affiliate", "subscription"]).default("none"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;
