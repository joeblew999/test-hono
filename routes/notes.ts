import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { listNotes, addNote, deleteNote, clearNotes } from '../queries'
import type { Note } from '../queries'
import { isSSE, respond, respondFragment } from '../sse'
import type { AppEnv, BroadcastConfig } from '../types'

// --- Schemas ---

const NoteSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  created_at: z.string(),
}).openapi('Note')

const NotesListSchema = z.object({
  notes: z.array(NoteSchema),
  noteCount: z.number().int(),
}).openapi('NotesList')

const AddNoteSchema = z.object({
  newNote: z.string().min(1).openapi({
    example: 'Buy groceries',
    description: 'Text of the note to add',
  }),
}).openapi('AddNote')

// --- Route Definitions ---

const listNotesRoute = createRoute({
  method: 'get',
  path: '/notes',
  tags: ['Notes'],
  summary: 'List all notes',
  description: 'Returns all notes ordered by creation date (newest first). SSE response renders HTML list items.',
  responses: {
    200: {
      content: { 'application/json': { schema: NotesListSchema } },
      description: 'List of notes',
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
      id: z.string().pipe(z.coerce.number().int()),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ deleted: z.number().int() }).openapi('DeletedNote') } },
      description: 'Deleted note ID',
    },
  },
})

const resetNotesRoute = createRoute({
  method: 'post',
  path: '/notes/reset',
  tags: ['Notes'],
  summary: 'Clear all notes',
  description: 'Deletes all notes. Used for test isolation.',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ noteCount: z.number().int() }).openapi('NotesReset') } },
      description: 'Notes cleared',
    },
  },
})

// --- Helpers ---

function renderNoteItem(note: Note): string {
  return `<li id="note-${note.id}" class="note-item"><span class="note-text">${note.text}</span><span class="note-date">${note.created_at}</span><button class="note-delete" data-on:click="@delete('/api/notes/${note.id}')">&times;</button></li>`
}

// --- Handlers ---

export default (bc?: BroadcastConfig) => {
  const app = new OpenAPIHono<AppEnv>()

  app.openapi(listNotesRoute, async (c) => {
    const notes = await listNotes(c.env.DB)
    const noteCount = notes.length

    if (isSSE(c)) {
      const html = notes.map(renderNoteItem).join('') || '<li class="note-empty">No notes yet</li>'
      return respondFragment(c, {
        signals: { noteCount },
        fragments: [{ selector: '#notes-list', html, mode: 'inner' }],
      })
    }
    return c.json({ notes, noteCount }, 200)
  })

  app.openapi(addNoteRoute, async (c) => {
    const { newNote } = c.req.valid('json')
    await addNote(c.env.DB, newNote)
    const notes = await listNotes(c.env.DB)
    const noteCount = notes.length
    const html = notes.map(renderNoteItem).join('')

    if (isSSE(c)) {
      return respondFragment(c, {
        signals: { noteCount, newNote: '' },
        fragments: [{ selector: '#notes-list', html, mode: 'inner' }],
      })
    }

    bc?.broadcast({ noteCount })
    return c.json({ notes, noteCount }, 200)
  })

  app.openapi(deleteNoteRoute, async (c) => {
    const id = Number(c.req.param('id'))
    await deleteNote(c.env.DB, id)
    const notes = await listNotes(c.env.DB)
    const noteCount = notes.length
    const html = notes.map(renderNoteItem).join('') || '<li class="note-empty">No notes yet</li>'

    if (isSSE(c)) {
      return respondFragment(c, {
        signals: { noteCount },
        fragments: [{ selector: '#notes-list', html, mode: 'inner' }],
      })
    }

    bc?.broadcast({ noteCount })
    return c.json({ deleted: id }, 200)
  })

  app.openapi(resetNotesRoute, async (c) => {
    await clearNotes(c.env.DB)
    bc?.broadcast({ noteCount: 0 })
    return respond(c, { noteCount: 0 })
  })

  return app
}
