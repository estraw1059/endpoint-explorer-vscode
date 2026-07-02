import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { AnalysisResult } from '../types';
import { ANALYSIS_INSTRUCTIONS, ENDPOINTS_SCHEMA } from './schema';
import { parseAnalysisJson } from './parse';

/**
 * Analyze the repo by shelling out to the Claude Code CLI. The CLI explores the
 * workspace with its own tools using the user's existing Claude login.
 */
export async function analyzeWithCli(
  progress: vscode.Progress<{ message?: string }>,
  token: vscode.CancellationToken,
): Promise<AnalysisResult> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    throw new Error('Open a folder to analyze.');
  }
  const cliPath = vscode.workspace.getConfiguration('endpointExplorer').get<string>('cliPath', 'claude');

  const prompt = `${ANALYSIS_INSTRUCTIONS}

Explore this repository to find the endpoints, then output ONLY a JSON object (no markdown fences, no prose) matching this JSON Schema exactly:

${JSON.stringify(ENDPOINTS_SCHEMA, null, 2)}`;

  progress.report({ message: 'Running Claude Code CLI (this can take a few minutes)…' });

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(cliPath, ['-p', prompt, '--output-format', 'json'], {
      cwd: root.uri.fsPath,
      env: process.env,
      shell: process.platform === 'win32',
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) =>
      reject(new Error(`Failed to launch "${cliPath}": ${e.message}. Is the Claude Code CLI installed?`)),
    );
    child.on('close', (code) => {
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${err.slice(0, 500)}`));
      }
    });
    token.onCancellationRequested(() => child.kill());
  });

  // --output-format json wraps the answer in {"result": "...", ...}
  let resultText = stdout;
  try {
    const envelope = JSON.parse(stdout);
    if (envelope && typeof envelope.result === 'string') {
      resultText = envelope.result;
    }
  } catch {
    // fall through — treat stdout as the raw answer
  }
  return parseAnalysisJson(resultText);
}
