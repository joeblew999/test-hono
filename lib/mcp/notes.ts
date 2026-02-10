import { z } from 'zod'
import { listNotes, createNote, deleteNote } from '../note-logic'
import { jsonResult } from './types'
import type { McpContext } from './types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function addNotesTools(mcp: McpServer, ctx: McpContext) {
  mcp.tool('notes_list', 'List notes for the authenticated user', {}, async () => {
    const notes = await listNotes(ctx.drizzleDb, ctx.userId)
    return jsonResult({ notes, noteCount: notes.length })
  })

  mcp.tool('notes_add', 'Add a new note', {
    text: z.string().min(1).describe('Note text'),
  }, async ({ text }) => {
    const note = await createNote(ctx.drizzleDb, ctx.userId, { newNote: text })
    return jsonResult(note)
  })

  mcp.tool('notes_delete', 'Delete a note by ID', {
    id: z.number().int().describe('Note ID to delete'),
  }, async ({ id }) => {
    await deleteNote(ctx.drizzleDb, ctx.userId, id)
    return jsonResult({ deleted: id })
  })
}
