#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createGatewayClient } from './client.js';
import { createAgentServer } from './tools.js';
await createAgentServer(createGatewayClient()).connect(new StdioServerTransport());
