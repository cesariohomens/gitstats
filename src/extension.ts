import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webview/gitStatsView';
import { GitService } from './gitService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "gitstats" is active!');
    
    const gitService = new GitService();
    let panel: vscode.WebviewPanel | undefined = undefined;
    let gitRepositories: string[] = [];
    
    // Find Git repositories in workspace folders
    async function findGitRepositories() {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }
        
        const repos = [];
        
        for (const folder of vscode.workspace.workspaceFolders) {
            try {
                const isRepo = await gitService.isGitRepository(folder.uri.fsPath);
                if (isRepo) {
                    repos.push(folder.uri.fsPath);
                }
            } catch (error) {
                console.error(`Error checking if ${folder.uri.fsPath} is a Git repository:`, error);
            }
        }
        
        return repos;
    }
    
    const disposable = vscode.commands.registerCommand('gitstats.helloWorld', async () => {
        // If panel already exists, focus it instead of creating a new one
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
            return;
        }
        
        // Find Git repositories
        gitRepositories = await findGitRepositories();
        
        if (gitRepositories.length === 0) {
            vscode.window.showErrorMessage('No Git repositories found in the workspace folders.');
            return;
        }
        
        // Create a new webview panel
        panel = vscode.window.createWebviewPanel(
            'gitStats',
            'Git Stats',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'media'))
                ],
                retainContextWhenHidden: true // Keep the webview state when hidden
            }
        );
        
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'extension-ready':
                        // The webview is ready, now load the repository data
                        if (gitRepositories.length > 0) {
                            await loadInitialData();
                        }
                        break;
                    case 'repository-changed':
                        try {
                            await handleRepositoryChanged(message.repositoryPath);
                        } catch (error) {
                            showError(`Error changing repository: ${error}`);
                        }
                        break;
                        
                    case 'refresh-stats':
                        try {
                            await refreshGitStats(
                                message.repositoryPath,
                                message.startDate,
                                message.endDate,
                                message.branch
                            );
                        } catch (error) {
                            showError(`Error updating statistics: ${error}`);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
        
        // Render initial interface (without data)
        updateWebviewContent();
        
        // Clear reference when panel is closed
        panel.onDidDispose(
            () => {
                panel = undefined;
            },
            null,
            context.subscriptions
        );
    });
    
    context.subscriptions.push(disposable);
    
    // Update webview content
    function updateWebviewContent(stats?: any) {
        if (panel) {
            panel.webview.html = getWebviewContent(
                context,
                panel.webview,
                vscode.workspace.workspaceFolders,
                gitRepositories,
                stats
            );
        }
    }
    
    // Show error messages
    function showError(message: string) {
        vscode.window.showErrorMessage(message);
    }
    
    // Handle repository change
    async function handleRepositoryChanged(repositoryPath: string) {
        if (!panel) return;
        
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Loading branches...",
                    cancellable: false
                },
                async () => {
                    // Get current branch and available branches
                    const currentBranch = await gitService.getCurrentBranch(repositoryPath);
                    const branches = await gitService.getBranches(repositoryPath);
                    
                    if (Object.keys(branches).length === 0) {
                        showError(`No branches found in repository ${repositoryPath}`);
                        return;
                    }
                    
                    // Update webview with branch information
                    updateWebviewContent({
                        workspacePath: repositoryPath,
                        branches,
                        branch: currentBranch
                    });
                }
            );
        } catch (error) {
            console.error('Error changing repository:', error);
            throw error;
        }
    }
    
    // Update Git statistics
    async function refreshGitStats(
        repositoryPath: string,
        startDate: string,
        endDate: string,
        branch: string
    ) {
        if (!panel) return;
        
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating Git statistics...",
                    cancellable: false
                },
                async () => {
                    // Generate Git statistics
                    const stats = await gitService.getGitStats(
                        repositoryPath,
                        startDate,
                        endDate,
                        branch
                    );
                    
                    // Update interface with statistics
                    updateWebviewContent(stats);
                }
            );
        } catch (error) {
            console.error('Error generating statistics:', error);
            throw error;
        }
    }

    // Load initial data for the first repository
    async function loadInitialData() {
        if (gitRepositories.length === 0 || !panel) return;
        
        try {
            console.log('Loading initial data for repository:', gitRepositories[0]);
            
            // First load repository branches
            const firstRepo = gitRepositories[0];
            await handleRepositoryChanged(firstRepo);
            
            // Load statistics for current branch
            const currentBranch = await gitService.getCurrentBranch(firstRepo);
            console.log('Loading statistics for branch:', currentBranch);
            
            await refreshGitStats(
                firstRepo, 
                "all",  // From beginning
                new Date().toISOString().split('T')[0],  // Today
                currentBranch
            );
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }
}

export function deactivate() {}
