import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'

import { TendClient } from './tendClient.js'

export function registerTendTools(server: McpServer, client: TendClient): void {
  server.registerTool(
    'list_appointments',
    {
      title: 'List Tend appointments',
      description: "List the authenticated patient's upcoming Tend appointments.",
      inputSchema: z.object({}),
    },
    async () => {
      const appointments = await client.listAppointments()
      if (!appointments.length) {
        return { content: [{ type: 'text', text: 'No upcoming appointments.' }] }
      }
      const summary = appointments
        .map((a) => `${a.startsAt} — ${a.type} with ${a.provider} at ${a.location} (id: ${a.id})`)
        .join('\n')
      return { content: [{ type: 'text', text: summary }] }
    }
  )

  server.registerTool(
    'book_appointment',
    {
      title: 'Book a Tend appointment',
      description:
        'Book an available appointment slot. Requires a slotId — look one up via a slot-search tool once one exists (not yet implemented).',
      inputSchema: z.object({
        slotId: z.string().describe('The slot ID to book, from an availability search.'),
      }),
    },
    async ({ slotId }) => {
      const appointment = await client.bookAppointment({ slotId })
      return {
        content: [
          {
            type: 'text',
            text: `Booked ${appointment.type} with ${appointment.provider} at ${appointment.location} on ${appointment.startsAt}.`,
          },
        ],
      }
    }
  )
}
