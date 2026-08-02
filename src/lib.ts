// Public library surface — safe to import from another Node/TS project
// without starting an MCP server (unlike index.ts, which calls serveStdio()
// at module load and is meant to be run as a process, not imported).
export {
  TendClient,
  configFromEnv,
  STUDIOS,
  SERVICE_TYPES,
  TendApiError,
} from './tendClient.js'
export type { TendConfig, Studio, ServiceType, TimeSlot, Appointment } from './tendClient.js'
