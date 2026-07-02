import * as vscode from 'vscode';
import { ExtensionState } from '../state';
import { SavedTemplate } from '../types';

export class TemplateItem extends vscode.TreeItem {
  constructor(readonly template: SavedTemplate) {
    super(template.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${template.request.method} ${template.request.url}`;
    this.tooltip = `Saved ${new Date(template.savedAt).toLocaleString()}`;
    this.iconPath = new vscode.ThemeIcon('bookmark');
    this.contextValue = 'template';
    this.command = {
      command: 'endpointExplorer.openTemplate',
      title: 'Open Template',
      arguments: [template],
    };
  }
}

export class TemplatesTreeProvider implements vscode.TreeDataProvider<TemplateItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly state: ExtensionState) {
    state.onDidChangeTemplates(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: TemplateItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<TemplateItem[]> {
    const templates = await this.state.getTemplates();
    return templates.map((t) => new TemplateItem(t));
  }
}
