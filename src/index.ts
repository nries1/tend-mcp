#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'

import { configFromEnv, TendClient } from './tendClient.js'
import { registerTendTools } from './tools.js'

serveStdio(() => {
  const server = new McpServer(
    { name: 'tend-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )
  const client = new TendClient(configFromEnv())
  registerTendTools(server, client)
  return server
})
