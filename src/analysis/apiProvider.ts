import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import { AnalysisResult } from '../types';
import { packFiles, scanWorkspace } from './scanner';
import { ANALYSIS_INSTRUCTIONS, ENDPOINTS_SCHEMA } from './schema';
import { parseAnalysisJson } from './parse';

export const API_KEY_SECRET = 'endpointExplorer.anthropicApiKey';

export async function ensureApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  let key = await context.secrets.get(API_KEY_SECRET);
  if (!key) {
    key = await vscode.window.showInputBox({
      title: 'Anthropic API Key',
      prompt: 'Enter your Anthropic API key (stored securely in VS Code SecretStorage)',
      password: true,
      ignoreFocusOut: true,
    });
    if (key) {
      await context.secrets.store(API_KEY_SECRET, key);
    }
  }
  return key || undefined;
}

export async function analyzeWithApi(
  context: vscode.ExtensionContext,
  progress: vscode.Progress<{ message?: string }>,
  token: vscode.CancellationToken,
): Promise<AnalysisResult> {
  const apiKey = await ensureApiKey(context);
  if (!apiKey) {
    throw new Error('An Anthropic API key is required for the API provider (or switch endpointExplorer.provider to "claude-cli").');
  }

  progress.report({ message: 'Scanning workspace files…' });
  const files = await scanWorkspace(token);
  if (files.length === 0) {
    throw new Error('No source files found to analyze.');
  }

  const model = vscode.workspace.getConfiguration('endpointExplorer').get<string>('model', 'claude-opus-4-8');
  const client = new Anthropic({ apiKey });

  progress.report({ message: `Analyzing ${files.length} files with ${model}…` });

  const stream = client.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: {
      format: { type: 'json_schema', schema: ENDPOINTS_SCHEMA as unknown as Record<string, unknown> },
    },
    system:
      'You are an expert API analyst. You are given the source files of a repository and must catalog every HTTP endpoint the repository serves.',
    messages: [
      {
        role: 'user',
        content: `${ANALYSIS_INSTRUCTIONS}\n\nRepository files:\n\n${packFiles(files)}`,
      },
    ],
  });

  token.onCancellationRequested(() => stream.abort());

  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to analyze this repository.');
  }
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') {
    throw new Error('Claude returned no analysis output.');
  }
  return parseAnalysisJson(text.text);
}
