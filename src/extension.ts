import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webview/gitStatsView';
import { GitService } from './gitService';

export function activate(context: vscode.ExtensionContext) {
    const gitService = new GitService();
    let panel: vscode.WebviewPanel | undefined;
    
    const disposable = vscode.commands.registerCommand('gitstats.helloWorld', async () => {
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
            return;
        }
        
        const gitRepositories = await findGitRepositories(gitService);
        if (gitRepositories.length === 0) {
            vscode.window.showErrorMessage('No Git repositories found in the workspace folders.');
            return;
        }
        
        panel = createWebviewPanel(context);
        updateWebviewContent(panel, context, gitRepositories);
        
        panel.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    await handleWebviewMessage(message, panel!, gitService, gitRepositories, context);
                } catch (error) {
                    showError(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            undefined,
            context.subscriptions
        );
        
        if (gitRepositories.length > 0) {
            await handleRepositoryChanged(gitRepositories[0], panel, gitService, context, gitRepositories);
        }
        
        panel.onDidDispose(() => panel = undefined, null, context.subscriptions);
    });
    
    context.subscriptions.push(disposable);
}

async function findGitRepositories(gitService: GitService): Promise<string[]> {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }
    
    const repos = [];
    for (const folder of vscode.workspace.workspaceFolders) {
        if (await gitService.isGitRepository(folder.uri.fsPath)) {
            repos.push(folder.uri.fsPath);
        }
    }
    return repos;
}

function createWebviewPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
        'gitStats',
        'Git Stats',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'media'))],
            retainContextWhenHidden: true
        }
    );
}

function updateWebviewContent(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    gitRepositories: string[],
    stats?: any
) {
    panel.webview.html = getWebviewContent(
        context,
        panel.webview,
        vscode.workspace.workspaceFolders,
        gitRepositories,
        stats
    );
}

async function handleWebviewMessage(
    message: any,
    panel: vscode.WebviewPanel,
    gitService: GitService,
    gitRepositories: string[],
    context: vscode.ExtensionContext
) {
    switch (message.command) {
        case 'repository-changed':
            await handleRepositoryChanged(message.repositoryPath, panel, gitService, context, gitRepositories);
            break;
            
        case 'refresh-stats':
            await refreshGitStats(
                message.repositoryPath,
                message.startDate,
                message.endDate,
                message.branch,
                panel,
                gitService,
                context,
                gitRepositories
            );
            break;
    }
}

async function handleRepositoryChanged(
    repositoryPath: string,
    panel: vscode.WebviewPanel,
    gitService: GitService,
    context: vscode.ExtensionContext,
    gitRepositories: string[]
) {
    const [currentBranch, branches] = await Promise.all([
        gitService.getCurrentBranch(repositoryPath),
        gitService.getBranches(repositoryPath)
    ]);
    
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    await refreshGitStats(
        repositoryPath,
        oneMonthAgo.toISOString().split('T')[0],
        new Date().toISOString().split('T')[0],
        currentBranch,
        panel,
        gitService,
        context,
        gitRepositories
    );
}

async function refreshGitStats(
    repositoryPath: string,
    startDate: string,
    endDate: string,
    branch: string,
    panel: vscode.WebviewPanel,
    gitService: GitService,
    context: vscode.ExtensionContext,
    gitRepositories: string[]
) {
    const stats = await gitService.getGitStats(repositoryPath, startDate, endDate, branch);
    updateWebviewContent(panel, context, gitRepositories, stats);
    panel.webview.postMessage({ command: 'stats-updated', gitStats: stats });
}

function showError(message: string) {
    vscode.window.showErrorMessage(message);
}

export function deactivate() {}