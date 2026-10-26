import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { catalogStatus, openCatalog, searchCatalog } from "../src/catalog.ts";

function fixture() {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE local_thread_catalog (
    host_id TEXT, thread_id TEXT, display_title TEXT,
    source_created_at REAL, source_updated_at REAL, source_recency_at REAL,
    source_kind TEXT, missing_candidate INTEGER)`);
  const insert = db.prepare("INSERT INTO local_thread_catalog VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run("chatgpt:x", "c1", "MCPとSQLite", 1790000000, 1790000100, 1790000100, "chatgpt", 0);
  insert.run("chatgpt:x", "c2", "mcp の設計", 1790000200, 1790000300, 1790000300, "chatgpt", 0);
  insert.run("chatgpt:x", "c3", "MCP 削除済み", 1790000000, 1790000000, 1790000000, "chatgpt", 1);
  insert.run("local", "t1", "MCP の CLI セッション", 1790000000, 1790000500, 1790000500, "cli", 0);
  insert.run("chatgpt:x", "c4", "100%_達成", 1790000000, 1790000000, 1790000000, "chatgpt", 0);
  return db;
}

test("matches chatgpt titles case-insensitively, newest first, excluding missing and non-chatgpt rows", () => {
  expect(searchCatalog(fixture(), "mcp", 20)).toEqual([
    { id: "c2", title: "mcp の設計", created_at: "2026-09-21T14:16:40.000Z", updated_at: "2026-09-21T14:18:20.000Z" },
    { id: "c1", title: "MCPとSQLite", created_at: "2026-09-21T14:13:20.000Z", updated_at: "2026-09-21T14:15:00.000Z" },
  ]);
});

test("requires every whitespace-separated word to match", () => {
  expect(searchCatalog(fixture(), "mcp sqlite", 20).map((c) => c.id)).toEqual(["c1"]);
});

test("treats LIKE wildcards literally", () => {
  expect(searchCatalog(fixture(), "%", 20).map((c) => c.id)).toEqual(["c4"]);
});

test("empty query lists recent chats up to the limit", () => {
  expect(searchCatalog(fixture(), "  ", 2).map((c) => c.id)).toEqual(["c2", "c1"]);
});


test("local catalog pagination uses offset without changing the original array response", () => {
  const db = fixture();
  expect(searchCatalog(db, "mcp", 1, 0).map((entry) => entry.id)).toEqual(["c2"]);
  expect(searchCatalog(db, "mcp", 1, 1).map((entry) => entry.id)).toEqual(["c1"]);
  expect(searchCatalog(db, "mcp", 1, 2)).toEqual([]);
  db.close();
});

test("catalog status only counts available ChatGPT entries", () => {
  const db = fixture();
  expect(catalogStatus(db, "/fake/catalog.db")).toEqual({
    catalog_path: "/fake/catalog.db",
    available_chats: 3,
  });
  db.close();
});

test("read-only catalog connection enforces query_only", () => {
  const folder = mkdtempSync(join(tmpdir(), "chatgpt-catalog-readonly-"));
  const path = join(folder, "catalog.db");
  try {
    const writable = new Database(path);
    writable.exec("CREATE TABLE sample (id INTEGER)");
    writable.close();
    const db = openCatalog(path);
    try {
      expect(db.query<{ query_only: number }, []>("PRAGMA query_only").get()?.query_only).toBe(1);
      expect(() => db.exec("INSERT INTO sample VALUES (1)")).toThrow();
    } finally {
      db.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
