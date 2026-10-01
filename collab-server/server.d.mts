export interface Relay {
  port: number;
  urls: string[];
  rooms: Map<string, { id: string; log: string[]; clients: Set<unknown> }>;
  close(): Promise<void>;
}

export function startRelay(options?: {
  port?: number;
  host?: string;
  dataDir?: string;
  quiet?: boolean;
}): Promise<Relay>;
