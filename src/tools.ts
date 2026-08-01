import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'

import { STUDIOS, SERVICE_TYPES, TendClient } from './tendClient.js'

export function registerTendTools(server: McpServer, client: TendClient): void {
  server.registerTool(
    'list_studios',
    {
      title: 'List Tend studios',
      description:
        'List Tend dental studio locations and which service codes each one offers. Static reference data, not a live API call — see README for why.',
      inputSchema: z.object({
        market: z.string().optional().describe('Filter to a market slug, e.g. "new-york-city".'),
      }),
    },
    async ({ market }) => {
      const studios = market ? STUDIOS.filter((s) => s.market === market) : STUDIOS
      const text = studios
        .map((s) => `${s.slug} (${s.market}) — services: ${s.serviceCodes.join(', ') || 'none listed'}`)
        .join('\n')
      return { content: [{ type: 'text', text }] }
    }
  )

  server.registerTool(
    'list_service_types',
    {
      title: 'List Tend service types',
      description:
        'List known appointment service type codes and what they mean. Incomplete — only codes seen with full metadata during capture are described; list_studios may reference codes not listed here.',
      inputSchema: z.object({}),
    },
    async () => {
      const text = SERVICE_TYPES.map(
        (s) => `${s.code} — ${s.longName}: ${s.bookingDescription} (${s.duration})`
      ).join('\n')
      return { content: [{ type: 'text', text }] }
    }
  )

  server.registerTool(
    'list_appointments',
    {
      title: 'List Tend appointments',
      description: "List the authenticated patient's Tend appointments (past and upcoming).",
      inputSchema: z.object({}),
    },
    async () => {
      const appointments = await client.listAppointments()
      if (!appointments.length) {
        return { content: [{ type: 'text', text: 'No appointments found.' }] }
      }
      const text = appointments
        .map(
          (a) =>
            `${a.startsAt} — ${a.serviceType} at ${a.studio} [${a.status ?? 'unknown status'}] (id: ${a.id})`
        )
        .join('\n')
      return { content: [{ type: 'text', text }] }
    }
  )

  server.registerTool(
    'search_available_slots',
    {
      title: 'Search available Tend appointment slots',
      description:
        'Search for bookable time slots at a studio for a service type within a date range. Call this before book_appointment — booking needs the exact operatoryId/providerId/startsAt/endsAt of a real returned slot, not arbitrary values.',
      inputSchema: z.object({
        studio: z.string().describe('Studio slug, e.g. "park-slope". See list_studios.'),
        service: z.string().describe('Service type code, e.g. "CLNCHK". See list_service_types / list_studios.'),
        startsAt: z.string().describe('ISO 8601 datetime with offset, start of search window.'),
        endsAt: z.string().describe('ISO 8601 datetime with offset, end of search window.'),
      }),
    },
    async ({ studio, service, startsAt, endsAt }) => {
      const slots = await client.searchAvailability({ studio, service, startsAt, endsAt })
      if (!slots.length) {
        return { content: [{ type: 'text', text: 'No available slots in that window.' }] }
      }
      const text = slots
        .map(
          (s) =>
            `${s.startsAt} – ${s.endsAt} (operatoryId: ${s.operatoryId}, providerId: ${s.providerId})`
        )
        .join('\n')
      return { content: [{ type: 'text', text }] }
    }
  )

  server.registerTool(
    'book_appointment',
    {
      title: 'Book a Tend appointment',
      description:
        'Book a specific slot returned by search_available_slots. All fields must match a real slot exactly — this does not search for availability itself.',
      inputSchema: z.object({
        studio: z.string(),
        service: z.string(),
        startsAt: z.string().describe('Must exactly match a slot from search_available_slots.'),
        endsAt: z.string().describe('Must exactly match a slot from search_available_slots.'),
        operatoryId: z.string().describe('From search_available_slots.'),
        providerId: z.string().describe('From search_available_slots.'),
      }),
    },
    async ({ studio, service, startsAt, endsAt, operatoryId, providerId }) => {
      const appointment = await client.bookAppointment({
        studio,
        service,
        startsAt,
        endsAt,
        operatoryId,
        providerId,
      })
      return {
        content: [
          {
            type: 'text',
            text: `Booked ${appointment.serviceType} at ${appointment.studio} on ${appointment.startsAt} (id: ${appointment.id}).`,
          },
        ],
      }
    }
  )
}
