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
        await this.state.setAuth(this.mergeAuth(msg.auth));
        vscode.window.setStatusBarMessage('$(check) Endpoint Explorer: auth saved', 3000);
      } else if (msg.type === 'fetchToken') {
        await this.state.setAuth(this.mergeAuth(msg.auth));
        try {
          const { expiresAt } = await this.state.refreshOAuthToken();
          view.webview.postMessage({ type: 'tokenResult', ok: true, expiresAt });
          vscode.window.setStatusBarMessage('$(check) Endpoint Explorer: token acquired', 3000);
        } catch (e) {
          view.webview.postMessage({
            type: 'tokenResult',
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else if (msg.type === 'ready') {
        view.webview.postMessage({ type: 'load', auth: this.state.getAuth() });
      }
    });
  }

  /** Keep fields the webview doesn't manage (e.g. the cached token) intact. */
  private mergeAuth(fromWebview: Partial<AuthConfig>): AuthConfig {
    return { ...this.state.getAuth(), ...fromWebview };
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
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.link { background: none; color: var(--vscode-textLink-foreground); padding: 2px 0; margin-top: 6px; text-align: left; width: auto; }
  button.link:hover { background: none; text-decoration: underline; }
  .hint { font-size: 11px; opacity: 0.7; margin-top: 6px; }
  .err { font-size: 11px; color: var(--vscode-errorForeground); margin-top: 6px; white-space: pre-wrap; word-break: break-word; }
  .group { display: none; }
  .group.active { display: block; }
  .token-status {
    margin-top: 12px; padding: 8px; border-radius: 3px; font-size: 12px;
    background: var(--vscode-textCodeBlock-background);
    border-left: 3px solid var(--vscode-testing-iconPassed, #73c991);
  }
  .token-status.expired { border-left-color: var(--vscode-errorForeground, #f14c4c); }
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
    <option value="oauth2">OAuth2 Client Credentials (Advanced)</option>
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

  <div class="group" id="group-oauth2">
    <div id="oauthForm">
      <label for="oauthTokenUrl">Token URL</label>
      <input id="oauthTokenUrl" placeholder="https://auth.example.com/oauth/token" />
      <label for="oauthClientId">Client ID</label>
      <input id="oauthClientId" />
      <label for="oauthClientSecret">Client Secret</label>
      <input id="oauthClientSecret" type="password" />
      <label for="oauthScope">Scope (optional)</label>
      <input id="oauthScope" placeholder="read:all write:all" />
      <button id="fetchToken">Save &amp; Fetch Token</button>
      <div class="hint">client_credentials grant. The token is attached as a Bearer header and auto-refreshed before it expires.</div>
    </div>
    <div id="oauthCompact" style="display:none">
      <div class="token-status" id="tokenStatus"></div>
      <button id="refreshToken">Refresh Token</button>
      <button id="editOauth" class="link">Edit credentials…</button>
    </div>
    <div class="err" id="oauthError"></div>
  </div>

  <button id="save" class="secondary">Save — applies to all endpoint calls</button>
  <div class="hint">Stored per-workspace. Merged into the headers of every request you send.</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let tokenExpiresAt = 0;
  let hasToken = false;

  function showGroup() {
    const type = $('authType').value;
    for (const g of document.querySelectorAll('.group')) g.classList.remove('active');
    const el = document.getElementById('group-' + type);
    if (el) el.classList.add('active');
  }
  $('authType').addEventListener('change', showGroup);

  // --- oauth compact/expanded switching ---
  function showOauthCompact(compact) {
    $('oauthForm').style.display = compact ? 'none' : 'block';
    $('oauthCompact').style.display = compact ? 'block' : 'none';
    if (compact) renderTokenStatus();
  }
  function renderTokenStatus() {
    const el = $('tokenStatus');
    if (!hasToken) { el.textContent = 'No token yet.'; return; }
    if (!tokenExpiresAt) {
      el.textContent = '✓ Token acquired (no expiry reported)';
      el.classList.remove('expired');
      return;
    }
    const mins = Math.round((tokenExpiresAt - Date.now()) / 60000);
    if (mins <= 0) {
      el.textContent = '⚠ Token expired — refresh, or it will auto-refresh on next send';
      el.classList.add('expired');
    } else {
      el.textContent = '✓ Token acquired — expires in ' + (mins >= 90 ? Math.round(mins / 60) + ' h' : mins + ' min');
      el.classList.remove('expired');
    }
  }
  setInterval(() => { if ($('oauthCompact').style.display !== 'none') renderTokenStatus(); }, 30000);

  $('editOauth').addEventListener('click', () => showOauthCompact(false));

  function collectAuth() {
    return {
      type: $('authType').value,
      baseUrl: $('baseUrl').value.trim().replace(/\\/$/, ''),
      bearerToken: $('bearerToken').value,
      basicUser: $('basicUser').value,
      basicPass: $('basicPass').value,
      apiKeyHeader: $('apiKeyHeader').value,
      apiKeyValue: $('apiKeyValue').value,
      oauthTokenUrl: $('oauthTokenUrl').value.trim(),
      oauthClientId: $('oauthClientId').value.trim(),
      oauthClientSecret: $('oauthClientSecret').value,
      oauthScope: $('oauthScope').value.trim(),
    };
  }

  function requestToken() {
    $('oauthError').textContent = '';
    const btn = $('oauthForm').style.display === 'none' ? $('refreshToken') : $('fetchToken');
    btn.disabled = true;
    btn.textContent = 'Fetching…';
    vscode.postMessage({ type: 'fetchToken', auth: collectAuth() });
  }
  $('fetchToken').addEventListener('click', requestToken);
  $('refreshToken').addEventListener('click', requestToken);

  $('save').addEventListener('click', () => {
    vscode.postMessage({ type: 'save', auth: collectAuth() });
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'load') {
      const a = msg.auth;
      $('authType').value = a.type;
      $('baseUrl').value = a.baseUrl || '';
      $('bearerToken').value = a.bearerToken || '';
      $('basicUser').value = a.basicUser || '';
      $('basicPass').value = a.basicPass || '';
      $('apiKeyHeader').value = a.apiKeyHeader || '';
      $('apiKeyValue').value = a.apiKeyValue || '';
      $('oauthTokenUrl').value = a.oauthTokenUrl || '';
      $('oauthClientId').value = a.oauthClientId || '';
      $('oauthClientSecret').value = a.oauthClientSecret || '';
      $('oauthScope').value = a.oauthScope || '';
      hasToken = !!a.oauthAccessToken;
      tokenExpiresAt = a.oauthExpiresAt || 0;
      showGroup();
      showOauthCompact(hasToken);
    } else if (msg.type === 'tokenResult') {
      $('fetchToken').disabled = false;
      $('fetchToken').textContent = 'Save & Fetch Token';
      $('refreshToken').disabled = false;
      $('refreshToken').textContent = 'Refresh Token';
      if (msg.ok) {
        hasToken = true;
        tokenExpiresAt = msg.expiresAt || 0;
        $('oauthError').textContent = '';
        showOauthCompact(true);
      } else {
        $('oauthError').textContent = msg.error;
        showOauthCompact(false);
      }
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
