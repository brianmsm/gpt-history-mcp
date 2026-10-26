# gpt-history-mcp

[English](README.md) | 日本語

AI アシスタントから **ChatGPT の会話を検索して、本文を読める**ようにする MCP サーバー（stdio）です。

データのエクスポートやスクレイピングは使いません。ChatGPT デスクトップアプリがディスクに同期している会話カタログを読み、本文は必要なときに ChatGPT から取得します。

```text
あなた: ChatGPT で ICP について話した会話を探して、要約して
Claude: → search_chatgpt_messages("ICP") → get_chatgpt_chat("6aa…") → 要約
```

> [!WARNING]
> このプロジェクトは、**公開されていない内部 API** の `chatgpt.com/backend-api` を使います。予告なく仕様が変わったり動かなくなったりする可能性があります。また、自動アクセスは OpenAI の利用規約に抵触するおそれがあります。
> 自分のアカウントで、読み取りだけに、人が操作するくらいの頻度で使ってください。一括ダウンロードには使わないでください。
> このプロジェクトは OpenAI とは無関係で、OpenAI の承認も受けていません。

## 特長

- **タイトル検索（オフライン）**: ChatGPT デスクトップアプリが手元に持っているカタログを検索します
- **全文検索**: ChatGPT 自身の検索でメッセージ本文まで探し、ヒット箇所の抜粋も返します
- **会話の読み込み**: 表示中のブランチを、`user` と `assistant` だけのきれいな発言列で返します
- **読み取り専用の設計**: `GET` リクエストしか送りません。ローカル DB は読み取り専用で開きます。トークンをログや出力に出しません。

## 必要なもの

- macOS の **ChatGPT デスクトップアプリ**（Codex 統合版）、または ChatGPT 会話カタログが同期済みの Linux/Omarchy 環境
- ChatGPT ログインが入った `~/.codex/auth.json`。`codex login` を実行し、ChatGPT アカウントでログインすると作られます。
- [Bun](https://bun.sh) 1.4 以上。サーバーは必ず Bun で動かしてください。ほかの HTTP クライアントは Cloudflare にブロックされます。

## インストール

この fork は npm 公開版ではなくローカルの Git チェックアウトから実行します。元の MIT ライセンスと Git 履歴を維持しています。

### npx ですぐに使う

クローンは不要です。`npx` が npm からパッケージを取ってきて Bun で起動します。そのため `bun` が `PATH` にある必要があります。

```sh
claude mcp add --scope user gpt-history-mcp -- npx -y gpt-history-mcp
```

ほかのクライアントでは、以下の例の設定を `"command": "npx"`、`"args": ["-y", "gpt-history-mcp"]` に置き換えてください。

### クローンして使う

```sh
git clone https://github.com/brianmsm/gpt-history-mcp.git
cd gpt-history-mcp
bun install
```

続けて、使う MCP クライアントに登録します。以下の例の `/path/to/gpt-history-mcp` は、クローンした場所の絶対パスに置き換えてください。
GUI アプリはシェルの `PATH` を引き継がないことがあります。GUI アプリの設定では `bun` も絶対パスで書いてください（`which bun` で調べられます。例: `/usr/local/bin/bun`）。

#### Linux / Omarchy（OMP）

この fork は Omarchy（Arch Linux）と Bun 1.4.4 で確認しています。
`~/.codex/sqlite/codex-dev.db` が同期されていれば、タイトル検索に
ChatGPT デスクトップ画面の起動や API 認証は不要です。

```sh
bun install --frozen-lockfile
mise which bun  # Omarchy/mise での Bun の絶対パス
bun test
bunx tsc --noEmit
```

`~/.omp/agent/mcp.json` の既存の `mcpServers` に、以下の項目を追加します。
Bun とリポジトリのパスは実際の絶対パスに置き換えてください。

```json
"gpt-history-mcp": {
  "type": "stdio",
  "command": "/absolute/path/to/bun",
  "args": ["/absolute/path/to/gpt-history-mcp/src/index.ts"],
  "timeout": 120000,
  "instructions": true
}
```

OMP で `/mcp reload` を実行します。
`chatgpt_catalog_status` でカタログを確認し、`search_chatgpt_chats` で
オフラインのタイトル検索を行います。次ページには `offset` を使います。
この二つのツールは認証情報やネットワークにアクセスしません。
`search_chatgpt_messages` と `get_chatgpt_chat` は、非公開の ChatGPT API
に対するオンデマンドの通信です。自動同期や定期ジョブは追加しません。

別のデータベースを利用する場合は MCP の `env` で
`CHATGPT_CATALOG_PATH` に SQLite ファイルの絶対パスを指定できます。
`CODEX_HOME` でも Codex のホームを変更できます。トークンを設定にコピーしないでください。

#### Claude Code

```sh
claude mcp add --scope user gpt-history-mcp -- bun /path/to/gpt-history-mcp/src/index.ts
```

特定のプロジェクトだけで使う場合は、そのプロジェクトのルートに次の `.mcp.json` を置きます。

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

`~/Library/Application Support/Claude/claude_desktop_config.json` に追記して、アプリを再起動します。

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

#### Codex（CLI と ChatGPT デスクトップ）

`~/.codex/config.toml` に追記します。

```toml
[mcp_servers.gpt-history-mcp]
command = "/usr/local/bin/bun"
args = ["/path/to/gpt-history-mcp/src/index.ts"]
```

#### Cursor

Claude Desktop と同じ `mcpServers` の JSON を、`~/.cursor/mcp.json`（プロジェクト単位なら `.cursor/mcp.json`）に書きます。

### 動作確認

クライアントから `search_chatgpt_chats` を空のクエリで呼び、最近の会話が返ってくれば成功です。
サーバー単体で確かめたいときは、MCP Inspector を使います。

```sh
bunx @modelcontextprotocol/inspector bun /path/to/gpt-history-mcp/src/index.ts
```

## ツール

| ツール | 入力 | 出力 | データ源 |
|---|---|---|---|
| `search_chatgpt_chats` | `query`, `limit`（既定 20）、`offset`（既定 0） | `[{id, title, created_at, updated_at}]` | ローカルのカタログ（ネットワークなし） |
| `search_chatgpt_messages` | `query`, `cursor?` | `{results: [{id, title, snippet, updated_at, archived}], next_cursor}` | `GET /backend-api/conversations/search` |
| `chatgpt_catalog_status` | 引数なし | `{catalog_path, available_chats}` | ローカルのカタログ（ネットワーク・認証なし） |
| `get_chatgpt_chat` | `id` | `{id, title, messages: [{role, content, create_time}]}` | `GET /backend-api/conversation/{id}` |

- `search_chatgpt_chats` はタイトルだけを対象にします。スペース区切りの語をすべて含むものを返し、空のクエリなら最近の会話を返します。次ページは `offset` で取得できます。
- `search_chatgpt_messages` はメッセージ本文も検索します。タイトルでは見つからないときに使います。
- `get_chatgpt_chat` は、ChatGPT で今表示されているブランチだけを返します。system、tool、非表示のメッセージは除きます。

## 仕組み

```text
~/.codex/sqlite/codex-dev.db          ~/.codex/auth.json
  local_thread_catalog                  tokens.access_token
  (source_kind = 'chatgpt')                   │
        │                                     ▼
  search_chatgpt_chats           chatgpt.com/backend-api  (Bun fetch)
                                   ├─ conversations/search → search_chatgpt_messages
                                   └─ conversation/{id}    → get_chatgpt_chat
```

- カタログの DB には、ChatGPT デスクトップアプリが起動中も書き込んでいます。そのため gpt-history-mcp は読み取り専用で開きます。
- `auth.json` のトークンは Codex が更新します。そのため gpt-history-mcp はリクエストのたびにファイルを読み直します。

## 設定

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `CODEX_HOME` | `~/.codex` | `auth.json` と `sqlite/codex-dev.db` を探す場所。クライアントの `env` 設定で渡します。 |
| `CHATGPT_CATALOG_PATH` | Codex ホームのカタログ | 認証情報の場所を変更せずに読み取り専用の SQLite カタログを指定できます。 |

## トラブルシューティング

| エラー | 原因と対処 |
|---|---|
| `401` | トークンの期限切れです。ChatGPT デスクトップアプリか Codex を開くか、`codex login` を実行してください。 |
| `403 (HTML)` | Cloudflare にブロックされています。サーバーを Bun で動かしているか確認してください。 |
| `auth.json not found` / `no ChatGPT token` | `codex login` で ChatGPT アカウントにログインしてください（API キーでのログインでは足りません）。 |
| `unable to open database file` | ChatGPT デスクトップアプリがまだ同期していないか、`CODEX_HOME` が別の場所を指しています。 |

## 開発

```sh
bun test            # ユニットテスト。実際の API や認証情報には触れません
bunx tsc --noEmit   # 型チェック
bun start           # stdio サーバーを起動（普通は MCP クライアントが起動します）
```

```text
src/
├── index.ts      MCP サーバーとツールの登録
├── catalog.ts    カタログの検索（bun:sqlite、読み取り専用）
├── chatgpt.ts    認証の読み込み、GET 専用の backend-api クライアント、レスポンスの正規化
├── linearize.ts  会話ツリーを時系列の発言に変換
├── paths.ts      CODEX_HOME の解決
└── time.ts       Unix 秒を ISO 8601 に変換
test/             bun test（フィクスチャ、偽の fetch、一時ファイル）
```

コントリビューターとエージェント向けのガイドラインは [AGENTS.md](AGENTS.md) にあります。

## ライセンス

[MIT](LICENSE)
