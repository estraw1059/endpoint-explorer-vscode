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

  // Settings quick-pick (gear icon on the Endpoints view)
  context.subscriptions.push(
    vscode.commands.registerCommand('endpointExplorer.openSettings', async () => {
      const config = vscode.workspace.getConfiguration('endpointExplorer');
      const provider = config.get<string>('provider', 'api');
      const hasKey = !!(await context.secrets.get(API_KEY_SECRET));

      const pick = await vscode.window.showQuickPick(
        [
          {
            id: 'provider',
            label: '$(arrow-swap) Claude Provider',
            description: provider === 'claude-cli' ? 'Claude Code CLI' : 'Anthropic API',
            detail: 'Switch between the Anthropic API and the Claude Code CLI for repo analysis.',
          },
          {
            id: 'setKey',
            label: '$(key) Set Anthropic API Key…',
            description: hasKey ? 'a key is saved' : 'no key saved',
            detail: 'Stored securely in VS Code SecretStorage. Used by the API provider only.',
          },
          {
            id: 'clearKey',
            label: '$(trash) Clear Anthropic API Key',
          },
          {
            id: 'all',
            label: '$(settings-gear) All Endpoint Explorer Settings…',
            detail: 'Model, CLI path, and everything else in the Settings UI.',
          },
        ],
        { title: 'Endpoint Explorer Settings' },
      );

      switch (pick?.id) {
        case 'provider': {
          const choice = await vscode.window.showQuickPick(
            [
              {
                id: 'api',
                label: 'Anthropic API',
                description: provider === 'api' ? 'current' : undefined,
                detail: 'Direct API calls with your Anthropic API key. Billed per token.',
              },
              {
                id: 'claude-cli',
                label: 'Claude Code CLI',
                description: provider === 'claude-cli' ? 'current' : undefined,
                detail: 'Uses your installed claude CLI and existing Claude Code login. No API key needed.',
              },
            ],
            { title: 'Claude Provider for Repo Analysis' },
          );
          if (choice && choice.id !== provider) {
            await config.update('provider', choice.id, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Endpoint Explorer: provider set to ${choice.label}.`);
          }
          break;
        }
        case 'setKey':
          await vscode.commands.executeCommand('endpointExplorer.setApiKey');
          break;
        case 'clearKey':
          await vscode.commands.executeCommand('endpointExplorer.clearApiKey');
          break;
        case 'all':
          await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:estraw1059.vs-endpoint-explorer',
          );
          break;
      }
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
