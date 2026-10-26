import { homedir } from "node:os";
import { join } from "node:path";

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), ".codex");

// Linux/Omarchy and macOS both use the Codex home catalog; allow an
// explicit location when running against a separately installed app.
export const catalogPath = () =>
  process.env.CHATGPT_CATALOG_PATH || join(codexHome(), "sqlite", "codex-dev.db");
