'use strict';

/**
 * Shared Zod v4 Runtime & MCP JSON-Schema Contracts (Pure CommonJS).
 * Single source of truth consumable by both Express TypeScript routes (`server/routes/*`)
 * and plain Node MCP stdio transport (`mcp/server.cjs`) without build-step divergence.
 */

const { z } = require('zod');

const PrioritySchema = z.enum(['low', 'normal', 'high']);

const SubtaskInputSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    title: z.string(),
    completed: z.boolean().optional(),
  }),
]);

const CreateCategoryBodySchema = z
  .object({
    id: z.string().max(128).optional(),
    name: z.string().trim().min(1, 'Kategori adı gereklidir.').max(200),
    color: z.string().max(64).optional(),
    pinned: z.boolean().optional(),
  })
  .passthrough();

const UpdateCategoryBodySchema = z
  .object({
    name: z.string().max(200).optional(),
    color: z.string().max(64).optional(),
    pinned: z.boolean().optional(),
  })
  .passthrough();

const ReorderIdsBodySchema = z
  .object({
    orderedIds: z.array(z.unknown()),
  })
  .passthrough();

const CreateTodoBodySchema = z
  .object({
    id: z.string().max(128).optional(),
    title: z.string().trim().min(1, 'Görev başlığı gereklidir.').max(500),
    notes: z.string().max(50_000).optional(),
    completed: z.boolean().optional(),
    important: z.boolean().optional(),
    pinned: z.boolean().optional(),
    priority: z.unknown().optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    dueTime: z.string().nullable().optional(),
    tags: z.array(z.unknown()).optional(),
    categoryId: z.string().nullable().optional(),
    subtasks: z.array(SubtaskInputSchema).optional(),
  })
  .passthrough();

const UpdateTodoBodySchema = z
  .object({
    title: z.string().max(500).optional(),
    notes: z.string().max(50_000).optional(),
    completed: z.boolean().optional(),
    important: z.boolean().optional(),
    pinned: z.boolean().optional(),
    priority: z.unknown().optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
    dueTime: z.string().nullable().optional(),
    tags: z.array(z.unknown()).optional(),
    categoryId: z.string().nullable().optional(),
  })
  .passthrough();

const CreateSubtaskBodySchema = z
  .object({
    title: z.string().trim().min(1, 'Alt görev başlığı gereklidir.').max(500),
  })
  .passthrough();

const UpdateSubtaskBodySchema = z
  .object({
    title: z.string().max(500).optional(),
    completed: z.boolean().optional(),
  })
  .passthrough();

const SettingsPatchBodySchema = z.record(z.string(), z.unknown());

const WebhookTestBodySchema = z
  .object({
    url: z.string().max(4096).optional(),
    secret: z.string().max(1024).optional(),
    format: z.enum(['auto', 'generic', 'discord', 'slack']).optional(),
  })
  .passthrough();

const CrashReportBodySchema = z.object({
  source: z.string().trim().min(1).max(64).default('renderer'),
  name: z.string().max(128).optional(),
  message: z.string().max(2000),
  stack: z.string().max(10_000).optional(),
  componentStack: z.string().max(10_000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const AiAskBodySchema = z
  .object({
    text: z.string().max(2000).optional(),
    language: z.string().max(32).optional(),
    readOnly: z.boolean().optional(),
    confirmToken: z.string().max(256).nullable().optional(),
    selectedTodoId: z.string().max(128).nullable().optional(),
  })
  .passthrough();

const AiRagSearchBodySchema = z
  .object({
    query: z.string().max(2000).optional(),
    topK: z.union([z.number(), z.string()]).optional(),
    minScore: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

// Canonical MCP tool input schemas compiled to JSON Schema via Zod v4 `z.toJSONSchema()`
const McpAddTaskArgsSchema = z.object({
  title: z.string().describe('Task title'),
  notes: z.string().optional().describe('Optional markdown/plain notes'),
  category: z.string().optional().describe('Category ID or name'),
  priority: PrioritySchema.optional().describe('Task priority'),
  important: z.boolean().optional(),
  pinned: z.boolean().optional(),
  startDate: z.string().optional().describe('YYYY-MM-DD'),
  dueDate: z.string().optional().describe('YYYY-MM-DD'),
  dueTime: z.string().optional().describe('HH:mm (24h)'),
  tags: z.array(z.string()).optional(),
  subtasks: z.array(z.string()).optional(),
});

const McpListTasksArgsSchema = z.object({
  filter: z.enum(['active', 'today', 'important', 'completed', 'all']).optional(),
  category: z.string().optional().describe('Category ID or name'),
  priority: PrioritySchema.optional(),
  tag: z.string().optional(),
  query: z.string().optional(),
  dateFrom: z.string().optional().describe('YYYY-MM-DD'),
  dateTo: z.string().optional().describe('YYYY-MM-DD'),
  sortBy: z.enum(['manual', 'dueDate', 'priority', 'newest', 'az']).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * Converts a Zod v4 schema to a clean Draft-7/2020-12 compatible JSON Schema object for MCP tools.
 * Strips `$schema` meta key so older MCP clients validate cleanly.
 * @param {any} zodSchema
 * @returns {Record<string, unknown>}
 */
function toMcpJsonSchema(zodSchema) {
  const raw = /** @type {Record<string, unknown>} */ (z.toJSONSchema(zodSchema));
  const { $schema: _omit, ...rest } = raw;
  return rest;
}

module.exports = {
  z,
  PrioritySchema,
  SubtaskInputSchema,
  CreateCategoryBodySchema,
  UpdateCategoryBodySchema,
  ReorderIdsBodySchema,
  CreateTodoBodySchema,
  UpdateTodoBodySchema,
  CreateSubtaskBodySchema,
  UpdateSubtaskBodySchema,
  SettingsPatchBodySchema,
  WebhookTestBodySchema,
  CrashReportBodySchema,
  AiAskBodySchema,
  AiRagSearchBodySchema,
  McpAddTaskArgsSchema,
  McpListTasksArgsSchema,
  toMcpJsonSchema,
};
