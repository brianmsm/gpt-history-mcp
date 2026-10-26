import { Database } from "bun:sqlite";
import { catalogPath } from "./paths.ts";
import { toIso } from "./time.ts";

export type CatalogEntry = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type CatalogStatus = {
  catalog_path: string;
  available_chats: number;
};

// ChatGPT Desktop keeps writing to this DB (WAL), so open it read-only and never write.
export function openCatalog(path = catalogPath()) {
  const db = new Database(path, { readonly: true });
  db.exec("PRAGMA query_only = ON");
  return db;
}

export function catalogStatus(db: Database, path = catalogPath()): CatalogStatus {
  const row = db.query<{ count: number }, []>(
    "SELECT COUNT(*) AS count FROM local_thread_catalog WHERE source_kind = 'chatgpt' AND missing_candidate = 0",
  ).get();
  return { catalog_path: path, available_chats: row?.count ?? 0 };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function searchCatalog(db: Database, query: string, limit: number, offset = 0): CatalogEntry[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const where = words.map(() => "AND display_title LIKE ? ESCAPE '\\'").join(" ");
  const rows = db
    .query<
      { thread_id: string; display_title: string; source_created_at: number; source_updated_at: number },
      (string | number)[]
    >(
      `SELECT thread_id, display_title, source_created_at, source_updated_at
       FROM local_thread_catalog
       WHERE source_kind = 'chatgpt' AND missing_candidate = 0 ${where}
       ORDER BY source_recency_at DESC, source_created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...words.map((w) => `%${escapeLike(w)}%`), limit, offset);
  return rows.map((r) => ({
    id: r.thread_id,
    title: r.display_title,
    created_at: toIso(r.source_created_at),
    updated_at: toIso(r.source_updated_at),
  }));
}
