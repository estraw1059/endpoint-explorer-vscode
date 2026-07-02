import * as vscode from 'vscode';
import { ExtensionState } from './state';
import { EndpointInfo, SavedTemplate } from './types';
import { analyzeWithApi, API_KEY_SECRET } from './analysis/apiProvider';
import { analyzeWithCli } from './analysis/cliProvider';
import { AuthViewProvider } from './views/authView';
import { EndpointsTreeProvider } from './views/endpointsTree';
import { TemplatesTreeProvider } from './views/templatesTree';
import { RequestPanel } from './panel/requestPanel';

function setHasEndpoints(has: boolean): void {
  vscode.commands.executeCommand('setContext', 'endpointExplorer.hasEndpoints', has);
}

export function activate(context: vscode.ExtensionContext): void {
  const state = new ExtensionState(context);

  // Initialise context key so the clear button shows/hides correctly on startup
  setHasEndpoints(state.getEndpoints().length > 0);

  // Tutorial
  context.subscriptions.push(
    vscode.commands.registerCommand('endpointExplorer.openTutorial', () =>
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'estraw1059.vs-endpoint-explorer#endpointExplorer.gettingStarted',
        false,
      ),
    ),
  );

  // One-time welcome on first activation
  const WELCOMED_KEY = 'endpointExplorer.welcomed';
  if (!context.globalState.get(WELCOMED_KEY)) {
    void context.globalState.update(WELCOMED_KEY, true);
    void vscode.window
      .showInformationMessage(
        'Welcome to Endpoint Explorer! Set up auth once, analyze your repo with Claude, and call any endpoint it finds.',
        'Open Tutorial',
      )
      .then((pick) => {
        if (pick) {
          void vscode.commands.executeCommand('endpointExplorer.openTutorial');
        }
      });
  }

  // Views
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AuthViewProvider.viewType, new AuthViewProvider(state)),
    vscode.window.registerTreeDataProvider('endpointExplorer.endpoints', new EndpointsTreeProvider(state)),
    vscode.window.registerTreeDataProvider('endpointExplorer.templates', new TemplatesTreeProvider(state)),
  );

  // Analyze
  context.subscriptions.push(
    vscode.commands.registerCommand('endpointExplorer.analyze', async () => {
      const provider = vscode.workspace
        .getConfiguration('endpointExplorer')
        .get<string>('provider', 'api');

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Endpoint Explorer: analyzing repo with Claude',
            cancellable: true,
          },
          (progress, token) =>
            provider === 'claude-cli'
              ? analyzeWithCli(progress, token)
              : analyzeWithApi(context, progress, token),
        );
        await state.setEndpoints(result.endpoints);
        setHasEndpoints(result.endpoints.length > 0);
        vscode.window.showInformationMessage(
          `Endpoint Explorer: found ${result.endpoints.length} endpoint${result.endpoints.length === 1 ? '' : 's'}.`,
        );
        await vscode.commands.executeCommand('endpointExplorer.endpoints.focus');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!/cancell?ed|aborted/i.test(message)) {
          vscode.window.showErrorMessage(`Endpoint analysis failed: ${message}`);
        }
      }
    }),
  );

  // Open endpoint / template in the request panel
  context.subscriptions.push(
    vscode.commands.registerCommand('endpointExplorer.openEndpoint', (endpoint: EndpointInfo) => {
      const baseUrl = state.getAuth().baseUrl || '';
      RequestPanel.show(state, RequestPanel.fromEndpoint(endpoint, baseUrl));
    }),
    vscode.commands.registerCommand('endpointExplorer.openTemplate', (template: SavedTemplate) => {
      RequestPanel.show(state, template.request);
    }),
    vscode.commands.registerCommand(
      'endpointExplorer.deleteTemplate',
      async (item: { template: SavedTemplate }) => {
        await state.deleteTemplate(item.template.name);
      },
    ),
    vscode.commands.registerCommand('endpointExplorer.clearEndpoints', async () => {
      await state.setEndpoints([]);
      setHasEndpoints(false);
    }),
  );

  // API key management
  context.subscriptions.push(
    vscode.commands.registerCommand('endpointExplorer.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'Anthropic API Key',
        prompt: 'Enter your Anthropic API key (stored securely in VS Code SecretStorage)',
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store(API_KEY_SECRET, key);
        vscode.window.showInformationMessage('Anthropic API key saved.');
      }
    }),
    vscode.commands.registerCommand('endpointExplorer.clearApiKey', async () => {
      await context.secrets.delete(API_KEY_SECRET);
      vscode.window.showInformationMessage('Anthropic API key cleared.');
    }),
  );
}

export function deactivate(): void {}
