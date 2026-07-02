import * as vscode from 'vscode';
import { ExtensionState } from '../state';
import { EndpointInfo, RequestState, SavedTemplate } from '../types';
import { getNonce } from '../views/authView';

interface SendPayload {
  method: string;
  url: string;
  headers: { name: string; value: string }[];
  body: string;
}

/**
 * Postman-style request editor. One panel is reused; opening a new endpoint or
 * template loads it into the existing panel.
 */
export class RequestPanel {
  private static current: RequestPanel | undefined;
  private pending: RequestState | undefined;
  private webviewReady = false;

  static show(state: ExtensionState, request: RequestState): void {
    if (RequestPanel.current) {
      RequestPanel.current.panel.reveal(vscode.ViewColumn.Active);
      RequestPanel.current.load(request);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'endpointExplorer.request',
      'Endpoint Explorer',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    RequestPanel.current = new RequestPanel(panel, state);
    RequestPanel.current.load(request);
  }

  static fromEndpoint(endpoint: EndpointInfo, baseUrl: string): RequestState {
    const hasBody = endpoint.requestBody !== null && !['GET', 'HEAD'].includes(endpoint.method);
    const headers = endpoint.headers.map((h) => ({ name: h.name, value: h.value, enabled: true }));
    if (hasBody && !headers.some((h) => h.name.toLowerCase() === 'content-type')) {
      headers.unshift({ name: 'Content-Type', value: 'application/json', enabled: true });
    }
    return {
      method: endpoint.method,
      url: `${baseUrl}${endpoint.path}`,
      pathParams: endpoint.pathParams,
      queryParams: endpoint.queryParams.map((q) => ({
        name: q.name,
        value: q.example,
        enabled: q.required,
      })),
      headers,
      body: hasBody ? endpoint.requestBody ?? '' : '',
      description: endpoint.description,
    };
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly state: ExtensionState,
  ) {
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(() => {
      RequestPanel.current = undefined;
    });
    panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
  }

  private load(request: RequestState): void {
    this.panel.title = `${request.method} ${shortPath(request.url)}`;
    if (this.webviewReady) {
      this.panel.webview.postMessage({ type: 'load', request });
    } else {
      this.pending = request;
    }
  }

  private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.webviewReady = true;
        if (this.pending) {
          this.panel.webview.postMessage({ type: 'load', request: this.pending });
          this.pending = undefined;
        }
        break;
      case 'send':
        await this.sendRequest(msg.payload as SendPayload);
        break;
      case 'saveTemplate':
        await this.saveTemplate(msg.request as RequestState);
        break;
    }
  }

  private async sendRequest(payload: SendPayload): Promise<void> {
    const started = Date.now();
    let headers: Record<string, string>;
    try {
      headers = { ...(await this.state.getFreshAuthHeaders()) };
    } catch (e) {
      this.panel.webview.postMessage({
        type: 'responseError',
        error: `OAuth token refresh failed: ${e instanceof Error ? e.message : String(e)}`,
        timeMs: Date.now() - started,
      });
      return;
    }
    for (const h of payload.headers) {
      if (h.name.trim()) {
        headers[h.name.trim()] = h.value;
      }
    }
    try {
      const response = await fetch(payload.url, {
        method: payload.method,
        headers,
        body: ['GET', 'HEAD'].includes(payload.method) || !payload.body ? undefined : payload.body,
      });
      const bodyText = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => (responseHeaders[k] = v));
      this.panel.webview.postMessage({
        type: 'response',
        status: response.status,
        statusText: response.statusText,
        timeMs: Date.now() - started,
        headers: responseHeaders,
        body: bodyText,
      });
    } catch (e) {
      this.panel.webview.postMessage({
        type: 'responseError',
        error: e instanceof Error ? e.message : String(e),
        timeMs: Date.now() - started,
      });
    }
  }

  private async saveTemplate(request: RequestState): Promise<void> {
    const defaultName = `${request.method} ${shortPath(request.url)}`;
    const name = await vscode.window.showInputBox({
      title: 'Save Template',
      prompt: 'Template name',
      value: defaultName,
      ignoreFocusOut: true,
    });
    if (!name) {
      return;
    }
    const template: SavedTemplate = { name, savedAt: new Date().toISOString(), request };
    try {
      await this.state.saveTemplate(template);
      vscode.window.setStatusBarMessage(`$(check) Template "${name}" saved`, 3000);
    } catch (e) {
      vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { --border: var(--vscode-panel-border, #444); }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px 16px; }
  .desc { opacity: 0.8; margin-bottom: 10px; font-size: 12px; }
  .request-line { display: flex; gap: 6px; margin-bottom: 12px; }
  select, input, textarea {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 5px 7px;
    font-family: var(--vscode-editor-font-family); font-size: 13px;
  }
  select:focus, input:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
  #method { width: 100px; font-weight: bold; }
  #url { flex: 1; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 2px; padding: 5px 16px; cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
  .tab { padding: 5px 12px; cursor: pointer; border-bottom: 2px solid transparent; font-size: 12px; }
  .tab.active { border-bottom-color: var(--vscode-focusBorder); font-weight: bold; }
  .tab-panel { display: none; min-height: 120px; }
  .tab-panel.active { display: block; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 4px 2px 0; }
  td input[type=text] { width: 100%; box-sizing: border-box; }
  td.check { width: 24px; }
  td.remove { width: 24px; text-align: center; cursor: pointer; opacity: 0.6; }
  td.remove:hover { opacity: 1; }
  .add-row { margin-top: 6px; font-size: 12px; cursor: pointer; color: var(--vscode-textLink-foreground); background: none; border: none; padding: 0; }
  #body { width: 100%; box-sizing: border-box; min-height: 160px; resize: vertical; }
  .response { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 10px; }
  .status-line { display: flex; gap: 16px; font-size: 12px; margin-bottom: 8px; }
  .status-ok { color: var(--vscode-testing-iconPassed, #73c991); font-weight: bold; }
  .status-bad { color: var(--vscode-testing-iconFailed, #f14c4c); font-weight: bold; }
  pre {
    background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 3px;
    overflow: auto; max-height: 420px; font-size: 12px; white-space: pre-wrap; word-break: break-word;
  }
  .resp-headers { font-size: 11px; opacity: 0.75; margin-bottom: 6px; max-height: 120px; overflow: auto; }
  .spin { opacity: 0.7; font-style: italic; }
  .hint { font-size: 11px; opacity: 0.6; margin-top: 4px; }
</style>
</head>
<body>
  <div class="desc" id="desc"></div>
  <div class="request-line">
    <select id="method">
      <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option>
      <option>DELETE</option><option>HEAD</option><option>OPTIONS</option>
    </select>
    <input id="url" type="text" spellcheck="false" />
    <button id="send">Send</button>
    <button id="save" class="secondary" title="Save this request as a reusable template">Save</button>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="params">Params</div>
    <div class="tab" data-tab="headers">Headers</div>
    <div class="tab" data-tab="pathParams">Path Variables</div>
    <div class="tab" data-tab="bodyTab">Body</div>
  </div>

  <div class="tab-panel active" id="panel-params">
    <table id="queryTable"><tbody></tbody></table>
    <button class="add-row" id="addQuery">+ Add query param</button>
  </div>
  <div class="tab-panel" id="panel-headers">
    <table id="headerTable"><tbody></tbody></table>
    <button class="add-row" id="addHeader">+ Add header</button>
    <div class="hint">Auth headers from the Authorization side panel are added automatically on send.</div>
  </div>
  <div class="tab-panel" id="panel-pathParams">
    <table id="pathTable"><tbody></tbody></table>
    <div class="hint">Values replace {name} / :name placeholders in the URL when sending.</div>
  </div>
  <div class="tab-panel" id="panel-bodyTab">
    <textarea id="body" spellcheck="false"></textarea>
  </div>

  <div class="response" id="response" style="display:none">
    <div class="status-line" id="statusLine"></div>
    <div class="resp-headers" id="respHeaders"></div>
    <pre id="respBody"></pre>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let currentDescription = '';

  // --- tabs ---
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('panel-' + tab.dataset.tab).classList.add('active');
    });
  }

  // --- key/value row helpers ---
  function addRow(tableId, name, value, enabled, placeholderName, removable) {
    const tr = document.createElement('tr');
    const checkCell = removable
      ? '<td class="check"><input type="checkbox" ' + (enabled ? 'checked' : '') + '></td>'
      : '<td class="check"></td>';
    tr.innerHTML = checkCell +
      '<td><input type="text" class="k" placeholder="' + placeholderName + '"></td>' +
      '<td><input type="text" class="v" placeholder="value"></td>' +
      (removable ? '<td class="remove" title="Remove">✕</td>' : '<td></td>');
    tr.querySelector('.k').value = name;
    tr.querySelector('.v').value = value;
    if (removable) {
      tr.querySelector('.remove').addEventListener('click', () => tr.remove());
    }
    $(tableId).querySelector('tbody').appendChild(tr);
  }

  function readRows(tableId) {
    const rows = [];
    for (const tr of $(tableId).querySelectorAll('tbody tr')) {
      const checkbox = tr.querySelector('input[type=checkbox]');
      rows.push({
        name: tr.querySelector('.k').value,
        value: tr.querySelector('.v').value,
        enabled: checkbox ? checkbox.checked : true,
      });
    }
    return rows;
  }

  $('addQuery').addEventListener('click', () => addRow('queryTable', '', '', true, 'param', true));
  $('addHeader').addEventListener('click', () => addRow('headerTable', '', '', true, 'Header-Name', true));

  // --- load a request into the form ---
  function loadRequest(r) {
    currentDescription = r.description || '';
    $('desc').textContent = currentDescription;
    $('method').value = r.method;
    $('url').value = r.url;
    $('body').value = r.body || '';
    for (const id of ['queryTable', 'headerTable', 'pathTable']) {
      $(id).querySelector('tbody').innerHTML = '';
    }
    for (const q of r.queryParams || []) addRow('queryTable', q.name, q.value, q.enabled, 'param', true);
    for (const h of r.headers || []) addRow('headerTable', h.name, h.value, h.enabled, 'Header-Name', true);
    for (const p of r.pathParams || []) addRow('pathTable', p.name, p.example, true, 'param', false);
    $('response').style.display = 'none';
  }

  function currentRequest() {
    return {
      method: $('method').value,
      url: $('url').value.trim(),
      pathParams: readRows('pathTable').map((r) => ({ name: r.name, example: r.value, description: '' })),
      queryParams: readRows('queryTable'),
      headers: readRows('headerTable'),
      body: $('body').value,
      description: currentDescription,
    };
  }

  function resolvedUrl(r) {
    let url = r.url;
    for (const p of r.pathParams) {
      if (!p.name) continue;
      url = url.split('{' + p.name + '}').join(encodeURIComponent(p.example));
      url = url.replace(new RegExp(':' + p.name + '(?![A-Za-z0-9_])', 'g'), encodeURIComponent(p.example));
    }
    const query = r.queryParams
      .filter((q) => q.enabled && q.name)
      .map((q) => encodeURIComponent(q.name) + '=' + encodeURIComponent(q.value))
      .join('&');
    if (query) url += (url.includes('?') ? '&' : '?') + query;
    return url;
  }

  // --- send ---
  $('send').addEventListener('click', () => {
    const r = currentRequest();
    $('response').style.display = 'block';
    $('statusLine').innerHTML = '<span class="spin">Sending…</span>';
    $('respHeaders').textContent = '';
    $('respBody').textContent = '';
    vscode.postMessage({
      type: 'send',
      payload: {
        method: r.method,
        url: resolvedUrl(r),
        headers: r.headers.filter((h) => h.enabled && h.name),
        body: r.body,
      },
    });
  });

  $('save').addEventListener('click', () => {
    vscode.postMessage({ type: 'saveTemplate', request: currentRequest() });
  });

  // --- messages from extension ---
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'load') {
      loadRequest(msg.request);
    } else if (msg.type === 'response') {
      const ok = msg.status < 400;
      $('statusLine').innerHTML =
        '<span class="' + (ok ? 'status-ok' : 'status-bad') + '">' + msg.status + ' ' + msg.statusText + '</span>' +
        '<span>' + msg.timeMs + ' ms</span>' +
        '<span>' + (msg.body ? msg.body.length : 0) + ' bytes</span>';
      $('respHeaders').textContent = Object.entries(msg.headers)
        .map(([k, v]) => k + ': ' + v).join('\\n');
      let body = msg.body;
      try { body = JSON.stringify(JSON.parse(msg.body), null, 2); } catch {}
      $('respBody').textContent = body;
    } else if (msg.type === 'responseError') {
      $('statusLine').innerHTML = '<span class="status-bad">Request failed</span><span>' + msg.timeMs + ' ms</span>';
      $('respBody').textContent = msg.error;
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

function shortPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
