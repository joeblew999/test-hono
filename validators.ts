import { z } from 'zod'

// =====================================================
// Zod Validation Schemas (shared by OpenAPI routes + MCP tools)
// Single source of truth — imported by routes/* and mcp.ts
//
// Separated from schema.ts so drizzle-kit generate works
// (drizzle-kit runs in Node.js CJS and can't handle .openapi())
// =====================================================

// --- Common ---

export const ErrorSchema = z.object({
  error: z.string(),
}).openapi('Error')

export const SuccessSchema = z.object({
  success: z.boolean(),
}).openapi('Success')

// --- Corrosion Sync ---

export const CrChangeSchema = z.object({
  table: z.string().min(1),
  pk: z.string(),
  cid: z.string(),
  val: z.union([z.string(), z.number(), z.null()]),
  col_version: z.number().int(),
  db_version: z.number().int(),
  site_id: z.string(),
})

export const CrChangesetsSchema = z.array(CrChangeSchema)

// --- Counter ---

export const CounterSchema = z.object({
  count: z.number().int().openapi({ example: 1 }),
}).openapi('Counter')

export const SetCountSchema = z.object({
  inputValue: z.number().int().openapi({
    example: 42,
    description: 'Value to set the counter to',
  }),
}).openapi('SetCount')

export const CounterFragmentSchema = z.object({
  count: z.number().int(),
  html: z.string(),
  renderedAt: z.string(),
}).openapi('CounterFragment')

// --- Notes ---

export const NoteSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  created_at: z.string(),
}).openapi('Note')

export const NotesListSchema = z.object({
  notes: z.array(NoteSchema),
  noteCount: z.number().int(),
}).openapi('NotesList')

export const AddNoteSchema = z.object({
  newNote: z.string().min(1).openapi({
    example: 'Buy groceries',
    description: 'Text of the note to add',
  }),
}).openapi('AddNote')

export const DeletedNoteSchema = z.object({
  deleted: z.number().int(),
}).openapi('DeletedNote')

export const NotesResetSchema = z.object({
  noteCount: z.number().int(),
}).openapi('NotesReset')

// --- Tasks ---

export const CreateTaskSchema = z.object({
  title: z.string().min(1).openapi({ example: 'Build MCP server', description: 'Title of the task' }),
  description: z.string().optional().openapi({ example: 'Integrate with Claude Desktop', description: 'Optional task description' }),
}).openapi('CreateTask')

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional().openapi({ description: 'New title' }),
  description: z.string().optional().openapi({ description: 'New description' }),
  status: z.enum(['pending', 'in_progress', 'completed']).optional().openapi({ description: 'Task status' }),
}).openapi('UpdateTask')

export const TaskSchema = z.object({
  id: z.number().int(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).openapi('Task')

export const TaskListSchema = z.object({
  tasks: z.array(TaskSchema),
  taskCount: z.number().int(),
}).openapi('TaskList')

export const TaskFilterSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']).optional().openapi({ description: 'Filter by status' }),
})

// --- Demo ---

export const DemoCredentialSchema = z.object({
  name: z.string().openapi({ example: 'Demo User' }),
  email: z.string().email().openapi({ example: 'demo@example.com' }),
  password: z.string().openapi({ example: 'demo1234' }),
  role: z.enum(['user', 'admin']).openapi({ example: 'user' }),
}).openapi('DemoCredential')

export const DemoCredentialsListSchema = z.object({
  credentials: z.array(DemoCredentialSchema),
}).openapi('DemoCredentialsList')
