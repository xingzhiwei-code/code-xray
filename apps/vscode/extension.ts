import {
  commands, Event, EventEmitter, ExtensionContext, Range, ThemeIcon, TreeDataProvider,
  TreeItem, TreeItemCollapsibleState, Uri, window, workspace,
} from 'vscode';
import { relative } from 'node:path';
import { analyze } from '../../packages/engine/index.js';
import type { AnalysisReport, Finding } from '../../packages/protocol/index.js';
import { LocalStore } from '../../packages/storage-local/index.js';
import { stalePaths } from '../../packages/workspace-local/index.js';
import { applyEvent, emptyLearningState, learningCard, syncBindings } from '../../packages/learning/engine.js';

type TreeNode =
  | { kind: 'summary'; text: string; tooltip: string }
  | { kind: 'action'; text: string; tooltip: string }
  | { kind: 'finding'; finding: Finding; report: AnalysisReport };

type SelectionScope =
  | { mode: 'selected'; paths: string[] }
  | { mode: 'uncommitted' };

type MaybeUri = { scheme?: unknown; fsPath?: unknown };

class FindingsTree implements TreeDataProvider<TreeNode> {
  private readonly changeEmitter = new EventEmitter<TreeNode | undefined>();
  public readonly onDidChangeTreeData: Event<TreeNode | undefined> = this.changeEmitter.event;
  private report: AnalysisReport | undefined;
  private staleCount = 0;

  set(report: AnalysisReport | undefined): void {
    this.report = report;
    this.staleCount = 0;
    this.changeEmitter.fire(undefined);
  }

  /** Restore the CLI/previous-session saved report; stale snapshots never render clickable positions. */
  async restoreSaved(root: string): Promise<void> {
    if (this.report) return;
    const report = await new LocalStore().loadReport<AnalysisReport>(root);
    if (!report) return;
    this.report = report;
    this.staleCount = (await stalePaths(root, report.snapshot)).length;
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(node: TreeNode): TreeItem {
    if (node.kind === 'summary') {
      return new TreeItem(node.text, TreeItemCollapsibleState.None);
    }
    if (node.kind === 'action') {
      const item = new TreeItem(node.text, TreeItemCollapsibleState.None);
      item.tooltip = node.tooltip;
      item.iconPath = new ThemeIcon('refresh');
      item.command = { command: 'codeXray.scan', title: 'Scan workspace' };
      return item;
    }
    const evidence = node.report.evidence.find(item => item.id === node.finding.evidenceIds[0]);
    const item = new TreeItem(node.finding.title, TreeItemCollapsibleState.None);
    item.description = `${node.finding.ruleId}${evidence ? ` · ${evidence.path}:${evidence.start.line}` : ''}`;
    item.tooltip = `${node.finding.title}\n${node.finding.nextCheck}\nKnowledge: ${node.finding.conceptId}`;
    item.iconPath = new ThemeIcon('shield');
    item.command = { command: 'codeXray.openFinding', title: 'Open evidence', arguments: [node] };
    item.contextValue = 'finding';
    return item;
  }

  getChildren(): TreeNode[] {
    if (!this.report) return [
      { kind: 'summary', text: 'No report yet. Run Code X-Ray: Scan Workspace.', tooltip: 'The scan is manual; save-triggered analysis is disabled by default.' },
      { kind: 'action', text: 'Scan workspace now', tooltip: 'Run Code X-Ray: Scan Workspace' },
    ];
    if (this.staleCount > 0) return [
      { kind: 'summary', text: `Saved report is stale: ${this.staleCount} file(s) changed since the scan.`, tooltip: 'Positions from an older snapshot are hidden to avoid wrong line numbers. Rescan to refresh.' },
      { kind: 'action', text: 'Rescan workspace now', tooltip: 'Run Code X-Ray: Scan Workspace' },
    ];
    const nodes: TreeNode[] = [{
      kind: 'summary',
      text: `${this.report.coverage.parsed} files · ${this.report.findings.length} findings · ${this.report.status}`,
      tooltip: this.report.summary,
    }];
    for (const finding of this.report.findings) nodes.push({ kind: 'finding', finding, report: this.report });
    return nodes;
  }
}

function selectedPaths(root: Uri): string[] {
  const paths = selectedUris.length ? selectedUris : (window.activeTextEditor ? [window.activeTextEditor.document.uri] : []);
  return paths
    .filter(uri => uri.scheme === 'file' && (uri.path === root.path || uri.path.startsWith(root.path + '/')))
    .map(uri => relative(root.fsPath, uri.fsPath));
}

let selectedUris: Uri[] = [];

async function analyzeVisibleWorkspace(root: Uri): Promise<AnalysisReport> {
  const unsaved = workspace.textDocuments.filter(document => !document.isUntitled && document.isDirty);
  if (unsaved.length) window.showWarningMessage(`Code X-Ray: ${unsaved.length} unsaved editor buffer(s) are not included. Save before scanning.`);
  const paths = selectedPaths(root);
  const scope: SelectionScope = paths.length ? { mode: 'selected', paths } : { mode: 'uncommitted' };
  return analyze({ path: root.fsPath, scope });
}

export async function activate(context: ExtensionContext): Promise<void> {
  const tree = new FindingsTree();
  const provider = window.registerTreeDataProvider('codeXray.findings', tree);
  const rootUri = workspace.workspaceFolders?.[0]?.uri;
  if (rootUri) void tree.restoreSaved(rootUri.fsPath);
  const openFinding = commands.registerCommand('codeXray.openFinding', async (node: { finding: Finding; report: AnalysisReport }) => {
    const evidence = node.report.evidence.find(item => item.id === node.finding.evidenceIds[0]);
    if (!evidence || !workspace.workspaceFolders?.[0]) return;
    const uri = Uri.joinPath(workspace.workspaceFolders[0].uri, evidence.path);
    const document = await workspace.openTextDocument(uri);
    const startLine = evidence.start.line - 1;
    const endLine = evidence.end.line - 1;
    await window.showTextDocument(document, { selection: new Range(startLine, evidence.start.column - 1, endLine, evidence.end.column - 1) });
    const detail = [
      node.finding.title,
      `Rule: ${node.finding.ruleId} · Knowledge: ${node.finding.conceptId}`,
      `Assumptions: ${node.finding.assumptions.join('; ')}`,
      `Unknowns: ${node.finding.uncertainties.join('; ')}`,
      `Next: ${node.finding.nextCheck}`,
    ].join('\n\n');
    window.showInformationMessage(detail, { modal: true });
  });
  const markLearning = commands.registerCommand('codeXray.markLearning', async (node: { finding: Finding; report: AnalysisReport }) => {
    const root = workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const store = new LocalStore();
    let state = await store.updateState(root.fsPath, emptyLearningState(), current => syncBindings(current, node.report).state);
    const binding = Object.values(state.bindings).find(item => item.findingId === node.finding.id);
    if (!binding) return;
    const updated = applyEvent(state, { type: 'set-status', bindingId: binding.id, status: 'learning' }, new Date().toISOString());
    state = updated.state;
    await store.updateState(root.fsPath, emptyLearningState(), () => state);
    window.showInformationMessage(`Code X-Ray: marked ${learningCard(binding).title} as learning.`);
  });
  const scan = commands.registerCommand('codeXray.scan', async () => {
    const root = rootUri;
    if (!root) {
      window.showErrorMessage('Code X-Ray: open a workspace folder first.');
      return;
    }
  await window.withProgress({ location: { viewId: 'codeXray.findings' }, title: 'Code X-Ray: analyzing selected scope' }, async () => {
    try {
      const report = await analyzeVisibleWorkspace(root);
      tree.set(report);
      await new LocalStore().saveReport(root.fsPath, report.analysisId, report);
      await new LocalStore().updateState(root.fsPath, emptyLearningState(), state => syncBindings(state, report).state);
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'INVALID_SCOPE') {
        window.showErrorMessage('Code X-Ray: 请选择文件或文件夹；没有选择且没有未提交更改时不扫描。');
        return;
      }
      throw error;
    }
  });
  });
  const scanSelection = commands.registerCommand('codeXray.scanSelection', async (arg?: MaybeUri | MaybeUri[]) => {
    selectedUris = [arg ?? []].flat().filter((item): item is Uri =>
      Boolean(item) && typeof (item as MaybeUri).scheme === 'string' && typeof (item as MaybeUri).fsPath === 'string'
    );
    await commands.executeCommand('codeXray.scan');
    selectedUris = [];
  });
  context.subscriptions.push(provider, scan, scanSelection, openFinding, markLearning);
}
