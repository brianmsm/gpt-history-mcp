import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogPath, codexHome } from "../src/paths.ts";

const toolText = (response: unknown) => {
  if (typeof response !== "object" || response === null || !("content" in response) ||
      !Array.isArray(response.content) || response.content[0]?.type !== "text") {
    throw new Error("Expected text MCP tool result");
  }
  return String(response.content[0].text);
};

test("Linux catalog path honors explicit override without modifying Codex home", () => {
  const home = process.env.CODEX_HOME;
  const override = process.env.CHATGPT_CATALOG_PATH;
  try {
    process.env.CODEX_HOME = "/tmp/test-codex-home";
    delete process.env.CHATGPT_CATALOG_PATH;
    expect(catalogPath()).toBe("/tmp/test-codex-home/sqlite/codex-dev.db");
    process.env.CHATGPT_CATALOG_PATH = "/tmp/external-catalog.db";
    expect(catalogPath()).toBe("/tmp/external-catalog.db");
    expect(codexHome()).toBe("/tmp/test-codex-home");
  } finally {
    if (home === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = home;
    if (override === undefined) delete process.env.CHATGPT_CATALOG_PATH;
    else process.env.CHATGPT_CATALOG_PATH = override;
  }
});

test("OMP-style stdio connection searches an offline Linux catalog without auth.json", async () => {
  const folder = mkdtempSync(join(tmpdir(), "gpt-history-omarchy-"));
  const catalog = join(folder, "catalog.db");
  const db = new Database(catalog);
  db.exec(
    "CREATE TABLE local_thread_catalog (thread_id TEXT, display_title TEXT, source_created_at REAL, source_updated_at REAL, source_recency_at REAL, source_kind TEXT, missing_candidate INTEGER)",
  );
  db.prepare("INSERT INTO local_thread_catalog VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "chat-1", "Omarchy session", 1790000000, 1790000100, 1790000100, "chatgpt", 0,
  );
  db.prepare("INSERT INTO local_thread_catalog VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "chat-2", "Omarchy later", 1790000200, 1790000300, 1790000300, "chatgpt", 0,
  );
  db.close();

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, CODEX_HOME: join(folder, "intentionally-no-auth"), CHATGPT_CATALOG_PATH: catalog },
  });
  const client = new Client({ name: "omp-omarchy-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "chatgpt_catalog_status", "get_chatgpt_chat", "search_chatgpt_chats", "search_chatgpt_messages",
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    expect(client.getInstructions()).toContain("offline title search");
    const status = await client.callTool({ name: "chatgpt_catalog_status", arguments: {} });
    expect(status.isError).toBeUndefined();
    expect(JSON.parse(toolText(status))).toEqual({
      catalog_path: catalog, available_chats: 2,
    });
    const first = await client.callTool({ name: "search_chatgpt_chats", arguments: { query: "Omarchy", limit: 1, offset: 0 } });
    const second = await client.callTool({ name: "search_chatgpt_chats", arguments: { query: "Omarchy", limit: 1, offset: 1 } });
    expect(JSON.parse(toolText(first))[0]?.id).toBe("chat-2");
    expect(JSON.parse(toolText(second))[0]?.id).toBe("chat-1");
  } finally {
    await client.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
