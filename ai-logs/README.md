# AI conversation logs

The brief (§4.17) asks for the AI conversations used to build this project. Only real, exported conversations belong here. Nothing in this folder is reconstructed or written from memory.

## What to put here

| File | Source | Status |
|---|---|---|
| `chatgpt-*.md` (or `.txt` / `.pdf`) | The earlier ChatGPT sessions that set up the project and built the first version (commits up to `3408218 Complete AR Manager assignment`). | **To be added by the developer** from ChatGPT's export (Settings → Data controls → Export, or copy each chat). |
| `claude-*.md` | The Claude session that audited the build against the brief and made the later changes: document helpers, client ageing bands, limit used, lists, payments, corrections, statement, dashboard and docs. | **To be added by the developer** from claude.ai (open the chat and export or copy it). |

## Before committing a log

Remove anything secret: the workspace id, any API keys or tokens, and personal details. The Supabase anon key is public by design (brief §3.1), but the workspace id is not.
