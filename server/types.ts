import type express from 'express';
import type { TodoDatabase } from '../src/db/database.ts';
import type { AiRuntimeService } from './services/aiRuntime.ts';
import type { CloudSyncService } from './services/cloudSync.ts';
import type { WebhookService } from './services/webhooks.ts';

export interface ServerContext {
  app: express.Express;
  db: TodoDatabase;
  dataDir: string;
  appVersion: string;
  githubReleasesApi: string;
  githubReleasesHtml: string;
  getActiveListenPort: () => number;
  sseClients: Set<express.Response>;
  maxSseClients: number;
  broadcastSseEvent: (eventPayload: Record<string, unknown>) => void;
  broadcastExternalChange: (reason: string) => void;
  cloudSync: CloudSyncService;
  webhooks: WebhookService;
  aiRuntime: AiRuntimeService;
}
