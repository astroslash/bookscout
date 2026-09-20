export type LogEvent = {
  event: "connector_invocation";
  requestId: string;
  connector: string;
  tool: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  providerCalls?: number;
  cache?: "hit" | "miss" | "none";
};

export interface Logger {
  log(event: LogEvent): void;
}

export const consoleLogger: Logger = {
  log(event) {
    console.info(JSON.stringify(event));
  },
};
