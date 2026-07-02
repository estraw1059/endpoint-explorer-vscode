# Analyze your repo

Click the **search icon** in the header of the **Endpoints** view (or run **Endpoint Explorer: Analyze Repo for Endpoints** from the Command Palette).

Claude reads the code in your workspace and catalogs every server-side route it defines: method, path, params, headers, an example request body, and whether the route requires auth.

Two provider options (Settings → `endpointExplorer.provider`):

| Provider | How it works |
|---|---|
| `api` (default) | Calls the Claude API with your Anthropic API key. You'll be prompted for the key on first run. |
| `claude-cli` | Uses your installed `claude` CLI and existing Claude Code login — no API key needed. |
