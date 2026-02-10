import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { listNotes, createNote, deleteNote, clearNotes } from '../lib/note-logic'
import { isSSE, respond, respondFragment, respondPersistentPollingFragments } from '../sse'
import { respondAfterMutation } from '../lib/route-helpers'
import { NoteSchema, NotesListSchema, AddNoteSchema, ErrorSchema, SuccessSchema, NotesResetSchema } from '../validators'
import { requireAuth } from '../lib/auth'
import { API, SEL } from '../constants'
import type { AppEnv, BroadcastConfig } from '../types'

// --- Route Definitions ---

const listNotesRoute = createRoute({
  method: 'get',
  path: '/notes',
  tags: ['Notes'],
  summary: 'List notes for authenticated user',
  description: 'Returns all notes ordered by creation date (newest first). SSE response renders HTML list items.',
  responses: {
    200: {
      content: { 'application/json': { schema: NotesListSchema } },
      description: 'List of notes',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

const addNoteRoute = createRoute({
  method: 'post',
  path: '/notes',
  tags: ['Notes'],
  summary: 'Add a note',
  description: 'Creates a new note. SSE response re-renders the list via fragment inner mode.',
  request: {
    body: {
      content: { 'application/json': { schema: AddNoteSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: NoteSchema } },
      description: 'Created note',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

const deleteNoteRoute = createRoute({
  method: 'delete',
  path: '/notes/{id}',
  tags: ['Notes'],
  summary: 'Delete a note',
  description: 'Deletes a note by ID. SSE response re-renders the list via fragment inner mode.',
  request: {
    params: z.object({
      id: z.coerce.number().int(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessSchema } },
      description: 'Note deleted',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

const resetNotesRoute = createRoute({
  method: 'post',
  path: '/notes/reset',
  tags: ['Notes'],
  summary: 'Clear all notes for authenticated user',
  description: 'Deletes all notes. Used for test isolation.',
  responses: {
    200: {
      content: { 'application/json': { schema: NotesResetSchema } },
      description: 'Notes cleared',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized',
    },
  },
})

// --- Helpers ---

type NoteRow = { id: number; text: string; createdAt: Date }

function renderNoteItem(note: NoteRow): string {
  const dateStr = note.createdAt.toLocaleString()
  return `<li id="note-${note.id}" class="note-item flex items-center gap-3 px-3 py-2.5 border-b border-base-300 last:border-b-0"><span class="note-text flex-1 text-sm">${note.text}</span><span class="note-date text-xs text-base-content/50 whitespace-nowrap">${dateStr}</span><button class="note-delete btn btn-xs btn-ghost text-error" data-on:click="@delete('${API.noteDelete(note.id)}')">&times;</button></li>`
}

const EMPTY_LIST_HTML = '<li class="note-empty text-center text-base-content/50 text-sm p-3">No notes yet</li>'

// --- Handlers ---

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<AppEnv>()

  // Auth middleware for all /notes/* routes
  app.use('/notes/*', requireAuth)

  app.openapi(listNotesRoute, async (c) => {
    const user = c.get('user')!
    const db = c.get('drizzleDb')
    const notes = await listNotes(db, user.id)
    const noteCount = notes.length
    const html = notes.map(renderNoteItem).join('') || EMPTY_LIST_HTML

    if (isSSE(c)) {
      const initial = {
        signals: { noteCount },
        fragments: [{ selector: SEL.NOTES_LIST, html, mode: 'inner' as const }],
      }

      // Push-based (Fly.io) — one-shot fragment
      if (bc?.subscribe) {
        return respondFragment(c, initial)
      }

      // Poll-based (Workers) — persistent stream, re-renders list when notes change
      let lastNoteIds = notes.map(n => n.id).join(',')
      return respondPersistentPollingFragments(c, initial, async () => {
        const freshNotes = await listNotes(db, user.id)
        const freshIds = freshNotes.map(n => n.id).join(',')
        if (freshIds === lastNoteIds) return null
        lastNoteIds = freshIds
        const freshHtml = freshNotes.map(renderNoteItem).join('') || EMPTY_LIST_HTML
        return {
          signals: { noteCount: freshNotes.length },
          fragments: [{ selector: SEL.NOTES_LIST, html: freshHtml, mode: 'inner' as const }],
        }
      })
    }
    return c.json({ notes, noteCount })
  })

  app.openapi(addNoteRoute, async (c) => {
    const user = c.get('user')!
    const data = c.req.valid('json')
    const db = c.get('drizzleDb')
    await createNote(db, user.id, data)
    const notes = await listNotes(db, user.id)
    return respondAfterMutation({
      c, items: notes, countKey: 'noteCount', selector: SEL.NOTES_LIST,
      renderItem: renderNoteItem, extraSignals: { newNote: '' },
      jsonResponse: { notes, noteCount: notes.length }, bc,
    })
  })

  app.openapi(deleteNoteRoute, async (c) => {
    const user = c.get('user')!
    const { id } = c.req.valid('param')
    const db = c.get('drizzleDb')
    await deleteNote(db, user.id, id)

    const notes = await listNotes(db, user.id)
    return respondAfterMutation({
      c, items: notes, countKey: 'noteCount', selector: SEL.NOTES_LIST,
      renderItem: renderNoteItem, emptyHtml: EMPTY_LIST_HTML,
      jsonResponse: { success: true }, bc,
    })
  })

  app.openapi(resetNotesRoute, async (c) => {
    const user = c.get('user')!
    const db = c.get('drizzleDb')
    await clearNotes(db, user.id)
    bc?.broadcast({ noteCount: 0 })
    return respond(c, { noteCount: 0 })
  })

  return app
}
