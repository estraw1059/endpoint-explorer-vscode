import * as vscode from 'vscode';
import { ExtensionState } from '../state';
import { EndpointInfo } from '../types';

export class EndpointItem extends vscode.TreeItem {
  constructor(readonly endpoint: EndpointInfo) {
    super(`${endpoint.method} ${endpoint.path}`, vscode.TreeItemCollapsibleState.None);
    this.description = endpoint.sourceFile;
    this.tooltip = new vscode.MarkdownString(
      `**${endpoint.method}** \`${endpoint.path}\`\n\n${endpoint.description}\n\n_${endpoint.sourceFile}_` +
        (endpoint.authRequired ? '\n\n$(lock) Requires auth' : ''),
      true,
    );
    this.iconPath = new vscode.ThemeIcon(methodIcon(endpoint.method));
    this.contextValue = 'endpoint';
    this.command = {
      command: 'endpointExplorer.openEndpoint',
      title: 'Open Endpoint',
      arguments: [endpoint],
    };
  }
}

function methodIcon(method: string): string {
  switch (method) {
    case 'GET':
      return 'arrow-down';
    case 'POST':
      return 'add';
    case 'PUT':
    case 'PATCH':
      return 'edit';
    case 'DELETE':
      return 'trash';
    default:
      return 'circle-outline';
  }
}

export class EndpointsTreeProvider implements vscode.TreeDataProvider<EndpointItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly state: ExtensionState) {
    state.onDidChangeEndpoints(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: EndpointItem): vscode.TreeItem {
    return element;
  }

  getChildren(): EndpointItem[] {
    return this.state.getEndpoints().map((e) => new EndpointItem(e));
  }
}
