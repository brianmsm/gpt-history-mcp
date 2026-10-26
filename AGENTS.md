---
last_validated: 2026-10-26
---

# AGENTS.md

MCP server (Bun, TypeScript, stdio) that reads ChatGPT conversations. See README.md for the tools and how they work.

## Commands

- `bun test`: run the tests. They use only a fake fetch, temp files, and in-memory SQLite.
- `bunx tsc --noEmit`: type check
- `bun start`: start the stdio server

A change is not done until both `bun test` and `bunx tsc --noEmit` pass.

## Structure

- `src/index.ts`: tool registration only. No logic here.
- `src/chatgpt.ts`: auth, `backendGet`, API response normalization (`getConversation`, `searchConversations`)
- `src/catalog.ts`: SQLite catalog search, offset paging, offline status
- `src/linearize.ts`: conversation tree (`mapping` + `current_node`) → list of messages
- `src/paths.ts`, `src/time.ts`: `codexHome`, `toIso`

## Linux / Omarchy

- This fork supports local title lookup on Linux/Omarchy via the Codex SQLite catalog.
  The optional `CHATGPT_CATALOG_PATH` overrides only the catalog, not authentication.
- Offline catalog calls never access the ChatGPT API or auth.json. Test this with
  the temp-fixture MCP session in `test/omarchy.test.ts`; never use user credentials
  in tests.
- In OMP, keep the server as stdio with an absolute Bun executable and checkout path.
  No periodic jobs or background collectors are needed.

## Safety

- **GET only**: never add write requests (POST, PATCH, DELETE) to backend-api. There must be no code path that modifies a conversation.
- **Bun fetch only**: curl, Python and node-fetch get an HTML 403 from Cloudflare. Route every HTTP call through `backendGet` (`src/chatgpt.ts`). Keep the `originator: codex_cli_rs` header.
- **Never leak the token**: keep the access token out of logs, error messages and tool output. Do not cache `readAuth`: Codex rewrites `auth.json` when it refreshes the token.
- **Catalog is read-only**: the ChatGPT desktop app writes to `codex-dev.db` while it runs. Keep `readonly: true` in `openCatalog`. Only use rows with `missing_candidate = 0`.
- **Timestamps are Unix seconds**: both the catalog and the API use seconds. Convert with `toIso` (`src/time.ts`).
- **Do not trust external JSON**: the API response shapes were inferred from the ChatGPT desktop bundle, not from a spec. Check each field with `typeof` before using it (follow `searchConversations`).
- **Keep user-facing text in English**: error messages and tool descriptions. Update the Troubleshooting sections in both README.md and README.ja.md when an error message changes.

## Tests

- Never touch the real `~/.codex/auth.json` or chatgpt.com from tests. Inject auth through the `auth` option and HTTP through `fetchImpl`.
- Leave checks against real data to the user. In Claude Code auto mode, commands that read `auth.json` are blocked.

## Docs

README.md (English) and README.ja.md (Japanese) have the same sections. Change both together.

## Release

Pushing a `v*` tag runs `.github/workflows/publish.yml`, which tests and publishes to npm via trusted publishing (no npm token).
Bump `version` in `package.json` first; the workflow fails if the tag does not equal `v<version>`.

```sh
npm version patch   # bumps package.json, commits, tags vX.Y.Z
git push origin main --follow-tags
```

## When the API shape changes

Search `/Applications/ChatGPT.app/Contents/Resources/app.asar` with `rg -a` (e.g. ``safeGet\(`/conversation``). No need to extract it.
