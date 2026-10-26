#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { catalogStatus, openCatalog, searchCatalog } from "./catalog.ts";
import { getConversation, searchConversations } from "./chatgpt.ts";
import packageJson from "../package.json" with { type: "json" };

const server = new McpServer(
  { name: "gpt-history-mcp", version: packageJson.version },
  {
    instructions: "ChatGPT catalog: use search_chatgpt_chats for offline title search and chatgpt_catalog_status for local availability; neither needs ChatGPT credentials or makes network requests. Search titles with offset for additional pages. Only when the user asks for full text or a complete conversation use search_chatgpt_messages or get_chatgpt_chat: those tools use an undocumented ChatGPT API and may fail. All tools are read-only. Do not perform bulk retrieval.",
  },
);
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

server.registerTool(
  "search_chatgpt_chats",
  {
    description:
      "Search ChatGPT conversations by title using the local Codex catalog (no network). An empty query lists the most recent chats.",
    inputSchema: {
      query: z.string().describe("Words in the title. All space-separated words must match."),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0).describe("Skip this many matches to get a later page."),
    },
    annotations: { ...readOnly, openWorldHint: false },
  },
  async ({ query, limit, offset }) => {
    const db = openCatalog();
    try {
      return json(searchCatalog(db, query, limit, offset));
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "chatgpt_catalog_status",
  {
    description: "Check local ChatGPT conversation catalog path and available title count. Offline and read-only; does not open auth.json.",
    inputSchema: {},
    annotations: { ...readOnly, openWorldHint: false },
  },
  async () => {
    const db = openCatalog();
    try {
      return json(catalogStatus(db));
    } finally {
      db.close();
    }
  },
);

server.registerTool(
  "get_chatgpt_chat",
  {
    description: "Read a ChatGPT conversation. Returns the user/assistant messages of the visible branch in chronological order.",
    inputSchema: { id: z.string().min(1).describe("Conversation ID (the id returned by search_* tools)") },
    annotations: readOnly,
  },
  async ({ id }) => json(await getConversation(id)),
);

server.registerTool(
  "search_chatgpt_messages",
  {
    description: "Full-text search over ChatGPT conversations, including message bodies, via ChatGPT's search API.",
    inputSchema: {
      query: z.string().min(1),
      cursor: z.string().optional().describe("next_cursor from the previous result"),
    },
    annotations: readOnly,
  },
  async ({ query, cursor }) => json(await searchConversations(query, cursor)),
);

await server.connect(new StdioServerTransport());
