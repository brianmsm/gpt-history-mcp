# gpt-history-mcp

English | [日本語](README.ja.md)

An MCP server (stdio) that lets your AI assistant **search and read your ChatGPT conversations**.

No data export and no scraping: it reads the conversation catalog that the ChatGPT desktop app already syncs to disk, and fetches message bodies from ChatGPT on demand.

```text
You:    Find the chat where I discussed our ICP with ChatGPT and summarize it.
Claude: → search_chatgpt_messages("ICP") → get_chatgpt_chat("6aa…") → summary
```

> [!WARNING]
> This project uses `chatgpt.com/backend-api`, an **undocumented internal API**. It may change or break at any time, and automated access may conflict with OpenAI's Terms of Use.
> Use it only with your own account, read-only, at human pace. Do not use it for bulk downloading.
> This project is not affiliated with or endorsed by OpenAI.

## Features

- **Title search, offline**: queries the local catalog kept by the ChatGPT desktop app
- **Full-text search**: searches message bodies through ChatGPT's own search, with snippets
- **Read a conversation**: returns the visible branch as a clean `user` / `assistant` transcript
- **Read-only by design**: only `GET` requests. The local database is opened read-only. Tokens never appear in logs or output.

## Requirements

- macOS with the **ChatGPT desktop app** (the version with Codex built in), or Linux/Omarchy with a Codex-backed ChatGPT conversation catalog already synced
- `~/.codex/auth.json` holding a ChatGPT login. Run `codex login` and sign in with your ChatGPT account to create it.
- [Bun](https://bun.sh) 1.4 or later. The server must run on Bun: other HTTP clients are blocked by Cloudflare.

## Installation

This fork is installed from the local checkout, not the upstream npm package. The original MIT license and upstream Git history are retained.

### Quick start with npx

No clone needed. `npx` fetches the package from npm and runs it with Bun, so `bun` must be on your `PATH`:

```sh
claude mcp add --scope user gpt-history-mcp -- npx -y gpt-history-mcp
```

For other clients, use `"command": "npx"` and `"args": ["-y", "gpt-history-mcp"]` in the examples below.

### From a clone

```sh
git clone https://github.com/brianmsm/gpt-history-mcp.git
cd gpt-history-mcp
bun install
```

Then register the server with your MCP client. In the examples below, replace `/path/to/gpt-history-mcp` with the absolute path of your clone.
GUI apps may not inherit your shell's `PATH`, so use the absolute path of `bun` there (find it with `which bun`, e.g. `/usr/local/bin/bun`).

#### Linux / Omarchy with OMP

This fork was tested on Omarchy (Arch Linux) with Bun 1.4.4 and a local
`~/.codex/sqlite/codex-dev.db` catalog populated by the Codex/ChatGPT client.
The ChatGPT desktop window does **not** need to stay open for local title search.

```sh
bun install --frozen-lockfile
mise which bun # get the absolute Bun executable on an Omarchy/mise setup
bun test
bunx tsc --noEmit
```

Add the following entry inside the existing `mcpServers` object in
`~/.omp/agent/mcp.json`, substituting the actual absolute Bun and checkout paths:

```json
"gpt-history-mcp": {
  "type": "stdio",
  "command": "/absolute/path/to/bun",
  "args": ["/absolute/path/to/gpt-history-mcp/src/index.ts"],
  "timeout": 120000,
  "instructions": true
}
```

Reload MCPs in OMP (`/mcp reload`) or start a new OMP session.
Use `chatgpt_catalog_status` first to check the catalog, then
`search_chatgpt_chats` for offline title search. Increase `offset` by `limit` to
request additional pages. Neither tool reads authentication or contacts ChatGPT.
`search_chatgpt_messages` and `get_chatgpt_chat` remain optional, on-demand
requests to an undocumented remote ChatGPT endpoint (not an offline lookup).
No synchronization daemon or scheduled job is installed.

If the catalog lives elsewhere, set `CHATGPT_CATALOG_PATH` to its full SQLite file
path in the MCP entry's `env` object; `CODEX_HOME` can also relocate the Codex
home. No tokens should be copied into the JSON configuration.

#### Claude Code

```sh
claude mcp add --scope user gpt-history-mcp -- bun /path/to/gpt-history-mcp/src/index.ts
```

To share it with a single project instead, put this `.mcp.json` at that project's root:

```json
{
  "mcpServers": {
    "gpt-history-mcp": {
      "command": "bun",
      "args": ["/path/to/gpt-history-mcp/src/index.ts"]
    }
  }
}
```

#### Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`, then restart the app:

```json
{
  "mcpServers": {
    "gpt-history-mcp": {
      "command": "/usr/local/bin/bun",
      "args": ["/path/to/gpt-history-mcp/src/index.ts"]
    }
  }
}
```

#### Codex (CLI and ChatGPT desktop)

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.gpt-history-mcp]
command = "/usr/local/bin/bun"
args = ["/path/to/gpt-history-mcp/src/index.ts"]
```

#### Cursor

Use the same `mcpServers` JSON as Claude Desktop, in `~/.cursor/mcp.json` (or `.cursor/mcp.json` for a single project).

### Verify

Call `search_chatgpt_chats` with an empty query from your client. It should list your recent chats.
To test the server on its own, use the MCP Inspector:

```sh
bunx @modelcontextprotocol/inspector bun /path/to/gpt-history-mcp/src/index.ts
```

## Tools

| Tool | Input | Output | Source |
|---|---|---|---|
| `search_chatgpt_chats` | `query`, `limit` (default 20), `offset` (default 0) | `[{id, title, created_at, updated_at}]` | Local catalog (no network) |
| `search_chatgpt_messages` | `query`, `cursor?` | `{results: [{id, title, snippet, updated_at, archived}], next_cursor}` | `GET /backend-api/conversations/search` |
| `chatgpt_catalog_status` | no input | `{catalog_path, available_chats}` | Local catalog (no network or auth) |
| `get_chatgpt_chat` | `id` | `{id, title, messages: [{role, content, create_time}]}` | `GET /backend-api/conversation/{id}` |

- `search_chatgpt_chats` matches titles only. All space-separated words must match. An empty query lists the most recent chats. Use `offset` to page past the first results.
- `search_chatgpt_messages` also searches message bodies. Use it when the title is not enough.
- `get_chatgpt_chat` returns only the branch currently shown in ChatGPT. System messages, tool messages and hidden messages are dropped.

## How it works

```text
~/.codex/sqlite/codex-dev.db          ~/.codex/auth.json
  local_thread_catalog                  tokens.access_token
  (source_kind = 'chatgpt')                   │
        │                                     ▼
  search_chatgpt_chats           chatgpt.com/backend-api  (Bun fetch)
                                   ├─ conversations/search → search_chatgpt_messages
                                   └─ conversation/{id}    → get_chatgpt_chat
```

- The ChatGPT desktop app writes to the catalog database while it runs, so gpt-history-mcp opens it read-only.
- Codex refreshes the token in `auth.json`, so gpt-history-mcp re-reads the file on every request.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `CODEX_HOME` | `~/.codex` | Where to find `auth.json` and `sqlite/codex-dev.db`. Pass it through your client's `env` setting. |
| `CHATGPT_CATALOG_PATH` | Codex home catalog | Override the read-only SQLite catalog path, without changing authentication location. |

## Troubleshooting

| Error | Cause and fix |
|---|---|
| `401` | The token has expired. Open the ChatGPT desktop app or Codex, or run `codex login`. |
| `403 (HTML)` | Cloudflare blocked the request. Make sure the server runs on Bun. |
| `auth.json not found` / `no ChatGPT token` | Run `codex login` and sign in with your ChatGPT account (API-key login is not enough). |
| `unable to open database file` | The ChatGPT desktop app has not synced yet, or `CODEX_HOME` points somewhere else. |

## Development

```sh
bun test            # unit tests. They never touch the real API or your credentials.
bunx tsc --noEmit   # type check
bun start           # start the stdio server (usually launched by an MCP client)
```

```text
src/
├── index.ts      MCP server and tool registration
├── catalog.ts    catalog search (bun:sqlite, read-only)
├── chatgpt.ts    auth loading, GET-only backend-api client, response normalization
├── linearize.ts  conversation tree → ordered messages
├── paths.ts      CODEX_HOME resolution
└── time.ts       Unix seconds → ISO 8601
test/             bun test (fixtures, fake fetch, temp files)
```

Contributor and agent guidelines are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
