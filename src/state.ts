import * as vscode from 'vscode';
import { AuthConfig, DEFAULT_AUTH, EndpointInfo, SavedTemplate } from './types';

const ENDPOINTS_KEY = 'endpointExplorer.endpoints';
const AUTH_KEY = 'endpointExplorer.auth';
const TEMPLATES_DIR = '.endpoint-explorer';
const TEMPLATES_FILE = 'templates.json';

export class ExtensionState {
  private readonly _onDidChangeEndpoints = new vscode.EventEmitter<void>();
  readonly onDidChangeEndpoints = this._onDidChangeEndpoints.event;

  private readonly _onDidChangeTemplates = new vscode.EventEmitter<void>();
  readonly onDidChangeTemplates = this._onDidChangeTemplates.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // --- Endpoints (persisted in workspace state) ---

  getEndpoints(): EndpointInfo[] {
    return this.context.workspaceState.get<EndpointInfo[]>(ENDPOINTS_KEY, []);
  }

  async setEndpoints(endpoints: EndpointInfo[]): Promise<void> {
    await this.context.workspaceState.update(ENDPOINTS_KEY, endpoints);
    this._onDidChangeEndpoints.fire();
  }

  // --- Auth (persisted in workspace state; secrets stay on this machine) ---

  getAuth(): AuthConfig {
    return { ...DEFAULT_AUTH, ...this.context.workspaceState.get<Partial<AuthConfig>>(AUTH_KEY, {}) };
  }

  async setAuth(auth: AuthConfig): Promise<void> {
    await this.context.workspaceState.update(AUTH_KEY, auth);
  }

  /** Headers implied by the shared auth config, merged into every request. */
  getAuthHeaders(): Record<string, string> {
    const auth = this.getAuth();
    switch (auth.type) {
      case 'bearer':
        return auth.bearerToken ? { Authorization: `Bearer ${auth.bearerToken}` } : {};
      case 'basic': {
        const encoded = Buffer.from(`${auth.basicUser}:${auth.basicPass}`).toString('base64');
        return { Authorization: `Basic ${encoded}` };
      }
      case 'apiKey':
        return auth.apiKeyHeader && auth.apiKeyValue ? { [auth.apiKeyHeader]: auth.apiKeyValue } : {};
      case 'oauth2':
        return auth.oauthAccessToken ? { Authorization: `Bearer ${auth.oauthAccessToken}` } : {};
      default:
        return {};
    }
  }

  /**
   * Like getAuthHeaders, but refreshes the OAuth token first when it is
   * missing or within 30s of expiry, so sends never go out with a dead token.
   */
  async getFreshAuthHeaders(): Promise<Record<string, string>> {
    const auth = this.getAuth();
    if (auth.type === 'oauth2' && auth.oauthTokenUrl) {
      const stale =
        !auth.oauthAccessToken ||
        (auth.oauthExpiresAt > 0 && Date.now() > auth.oauthExpiresAt - 30_000);
      if (stale) {
        await this.refreshOAuthToken();
      }
    }
    return this.getAuthHeaders();
  }

  /** client_credentials grant; credentials are sent form-encoded in the body. */
  async refreshOAuthToken(): Promise<{ expiresAt: number }> {
    const auth = this.getAuth();
    if (!auth.oauthTokenUrl || !auth.oauthClientId) {
      throw new Error('OAuth token URL and client ID are required.');
    }
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.oauthClientId,
      client_secret: auth.oauthClientSecret,
    });
    if (auth.oauthScope) {
      form.set('scope', auth.oauthScope);
    }
    const response = await fetch(auth.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Token endpoint returned ${response.status}: ${text.slice(0, 300)}`);
    }
    let json: { access_token?: string; expires_in?: number };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Token endpoint did not return JSON.');
    }
    if (!json.access_token) {
      throw new Error('Token response had no access_token field.');
    }
    const expiresAt = json.expires_in ? Date.now() + json.expires_in * 1000 : 0;
    await this.setAuth({ ...this.getAuth(), oauthAccessToken: json.access_token, oauthExpiresAt: expiresAt });
    return { expiresAt };
  }

  // --- Templates (persisted as a JSON file in the workspace so they can be committed) ---

  private templatesUri(): vscode.Uri | undefined {
    const root = vscode.workspace.workspaceFolders?.[0];
    if (!root) {
      return undefined;
    }
    return vscode.Uri.joinPath(root.uri, TEMPLATES_DIR, TEMPLATES_FILE);
  }

  async getTemplates(): Promise<SavedTemplate[]> {
    const uri = this.templatesUri();
    if (!uri) {
      return [];
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async saveTemplate(template: SavedTemplate): Promise<void> {
    const uri = this.templatesUri();
    if (!uri) {
      throw new Error('Open a folder to save templates.');
    }
    const templates = await this.getTemplates();
    const existing = templates.findIndex((t) => t.name === template.name);
    if (existing >= 0) {
      templates[existing] = template;
    } else {
      templates.push(template);
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(templates, null, 2), 'utf8'));
    this._onDidChangeTemplates.fire();
  }

  async deleteTemplate(name: string): Promise<void> {
    const uri = this.templatesUri();
    if (!uri) {
      return;
    }
    const templates = (await this.getTemplates()).filter((t) => t.name !== name);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(templates, null, 2), 'utf8'));
    this._onDidChangeTemplates.fire();
  }
}
