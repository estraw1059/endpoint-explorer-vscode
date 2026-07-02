import * as vscode from 'vscode';
import { ExtensionState } from '../state';
import { AuthConfig } from '../types';

/**
 * Sidebar webview: fill out auth once and it's applied to every endpoint call
 * in this workspace. Also holds the shared base URL.
 */
export class AuthViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'endpointExplorer.auth';

  constructor(private readonly state: ExtensionState) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'save') {
        await this.state.setAuth(msg.auth as AuthConfig);
        vscode.window.setStatusBarMessage('$(check) Endpoint Explorer: auth saved', 3000);
      } else if (msg.type === 'ready') {
        view.webview.postMessage({ type: 'load', auth: this.state.getAuth() });
      }
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px 12px; }
  label { display: block; margin-top: 10px; margin-bottom: 3px; font-size: 11px; text-transform: uppercase; opacity: 0.8; }
  input, select {
    width: 100%; box-sizing: border-box; padding: 4px 6px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px;
  }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); }
  button {
    margin-top: 14px; width: 100%; padding: 6px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 2px; cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .hint { font-size: 11px; opacity: 0.7; margin-top: 6px; }
  .group { display: none; }
  .group.active { display: block; }
</style>
</head>
<body>
  <label for="baseUrl">Base URL</label>
  <input id="baseUrl" placeholder="http://localhost:3000" />

  <label for="authType">Auth Type</label>
  <select id="authType">
    <option value="none">None</option>
    <option value="bearer">Bearer Token</option>
    <option value="basic">Basic Auth</option>
    <option value="apiKey">API Key Header</option>
  </select>

  <div class="group" id="group-bearer">
    <label for="bearerToken">Token</label>
    <input id="bearerToken" type="password" placeholder="eyJhbGciOi…" />
  </div>

  <div class="group" id="group-basic">
    <label for="basicUser">Username</label>
    <input id="basicUser" />
    <label for="basicPass">Password</label>
    <input id="basicPass" type="password" />
  </div>

  <div class="group" id="group-apiKey">
    <label for="apiKeyHeader">Header Name</label>
    <input id="apiKeyHeader" placeholder="X-API-Key" />
    <label for="apiKeyValue">Value</label>
    <input id="apiKeyValue" type="password" />
  </div>

  <button id="save">Save — applies to all endpoint calls</button>
  <div class="hint">Stored per-workspace. Merged into the headers of every request you send.</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  function showGroup() {
    const type = $('authType').value;
    for (const g of document.querySelectorAll('.group')) g.classList.remove('active');
    const el = document.getElementById('group-' + type);
    if (el) el.classList.add('active');
  }
  $('authType').addEventListener('change', showGroup);

  $('save').addEventListener('click', () => {
    vscode.postMessage({ type: 'save', auth: {
      type: $('authType').value,
      baseUrl: $('baseUrl').value.trim().replace(/\\/$/, ''),
      bearerToken: $('bearerToken').value,
      basicUser: $('basicUser').value,
      basicPass: $('basicPass').value,
      apiKeyHeader: $('apiKeyHeader').value,
      apiKeyValue: $('apiKeyValue').value,
    }});
  });

  window.addEventListener('message', (e) => {
    if (e.data.type === 'load') {
      const a = e.data.auth;
      $('authType').value = a.type;
      $('baseUrl').value = a.baseUrl || '';
      $('bearerToken').value = a.bearerToken || '';
      $('basicUser').value = a.basicUser || '';
      $('basicPass').value = a.basicPass || '';
      $('apiKeyHeader').value = a.apiKeyHeader || '';
      $('apiKeyValue').value = a.apiKeyValue || '';
      showGroup();
    }
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

export function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
