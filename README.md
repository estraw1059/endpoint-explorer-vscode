# Endpoint Explorer

A VS Code extension that analyzes your repo with Claude to discover every API endpoint it serves, then lets you call them Postman-style — with shared auth configured once for the whole workspace.

## Features

- **Analyze** — the search button on the *Endpoints* view sends your repo to Claude and catalogs every server-side route: method, path, params, headers, example bodies, and whether auth is required.
- **Postman-style requests** — click an endpoint to open a request editor pre-filled with everything Claude found. Edit params/headers/body, hit **Send**, see status/time/headers/body.
- **Shared Authorization panel** — set the base URL and auth (Bearer / Basic / API-key header) once in the sidebar; it's merged into every request automatically.
- **Templates** — **Save** any request as a named template. Templates live in `.endpoint-explorer/templates.json` in your workspace, so they can be committed and shared.

## Claude providers

Set `endpointExplorer.provider` in settings:

| Provider | How it works |
|---|---|
| `api` (default) | Calls the Claude API directly via `@anthropic-ai/sdk`. Run **Endpoint Explorer: Set Anthropic API Key** once (stored in VS Code SecretStorage). Billed per token. Model configurable via `endpointExplorer.model` (default `claude-opus-4-8`). |
| `claude-cli` | Shells out to your installed `claude` CLI, which explores the repo itself using your existing Claude Code login. No API key needed. Path configurable via `endpointExplorer.cliPath`. |

## Installing

Not yet on the marketplace. Until then, install from a `.vsix`:

1. Grab the latest `.vsix` from the [Releases page](https://github.com/ericstraw/vs-endpoint-explorer/releases) (or build one yourself with `npm install && npm run package`).
2. In VS Code: **Extensions** view → `…` menu → **Install from VSIX…**, or from a terminal:

   ```sh
   code --install-extension endpoint-explorer-*.vsix
   ```

## Development

```sh
npm install
npm run compile   # or: npm run watch
```

Press **F5** in VS Code to launch the Extension Development Host, then open a repo with an API in it and hit the Endpoint Explorer icon in the activity bar.

### Releasing

CI builds and uploads a `.vsix` artifact on every push to `main`. To cut a downloadable release, push a version tag:

```sh
npm version patch          # bumps package.json + creates the tag
git push --follow-tags
```

The release workflow packages the extension and attaches the `.vsix` to a GitHub release.

## License

[MIT](LICENSE)
