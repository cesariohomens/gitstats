import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webview/gitStatsView';
import { GitService } from './gitService';

export function activate(context: vscode.ExtensionContext) {
    let initialDataLoaded = false;
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
        
        // Render initial interface (without data)
        updateWebviewContent();
        
        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                console.log('Received message from webview:', message);
                
                switch (message.command) {
                    case 'extension-ready':
                        // The webview is ready, now load the repository data
                        if (gitRepositories.length > 0) {
                            try {
                                // Only load initial data once
                                if (!initialDataLoaded) {
                                    await loadInitialData();
                                    initialDataLoaded = true;
                                }
                            } catch (error) {
                                console.error('Error loading initial data:', error);
                            }
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
    async function handleRepositoryChanged(repositoryPath: string, skipAutoRefresh = false): Promise<string> {
        if (!panel) {
            return '';
        }
        
        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Loading branches...",
                    cancellable: false
                },
                async () => {
                    console.log('Loading branches for repository:', repositoryPath);
                    
                    // Get current branch and available branches
                    const currentBranch = await gitService.getCurrentBranch(repositoryPath);
                    const branches = await gitService.getBranches(repositoryPath);
                    
                    console.log('Current branch:', currentBranch);
                    console.log('Available branches:', Object.keys(branches).length);
                    
                    if (Object.keys(branches).length === 0) {
                        showError(`No branches found in repository ${repositoryPath}`);
                        return currentBranch;
                    }
                    
                    // Update webview with branch information
                    updateWebviewContent({
                        workspacePath: repositoryPath,
                        branches,
                        branch: currentBranch
                    });
                    
                    // Substituir o uso de "all" por uma data específica
                    const oneMonthAgo = new Date();
                    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                    const startDate = oneMonthAgo.toISOString().split('T')[0];

                    // Only auto-load stats if not being called from loadInitialData
                    if (!skipAutoRefresh) {
                        await refreshGitStats(
                            repositoryPath,
                            startDate, // Em vez de "all"
                            new Date().toISOString().split('T')[0], // Today
                            currentBranch
                        );
                    }
                    
                    return currentBranch;
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
        if (!panel) {
            return;
        }
        
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating Git statistics...",
                    cancellable: false
                },
                async () => {
                    console.log('Generating statistics for:', repositoryPath, branch, startDate, endDate);
                    
                    // Generate Git statistics
                    const stats = await gitService.getGitStats(
                        repositoryPath,
                        startDate,
                        endDate,
                        branch
                    );
                    
                    // Add workspace path to stats for UI reference
                    const statsWithPath = {
                        ...stats,
                        workspacePath: repositoryPath
                    };
                    
                    console.log('Statistics generated with', stats.dateList.length, 'dates and', 
                              Object.keys(stats.authorNames).length, 'authors');
                    
                    // Update interface with statistics
                    updateWebviewContent(statsWithPath);

                    // Notify webview that stats update is complete
                    if (panel) {
                        panel.webview.postMessage({ command: 'stats-updated' });
                    }
                }
            );
        } catch (error) {
            console.error('Error generating statistics:', error);
            throw error;
        }
    }

    // Load initial data for the first repository
    async function loadInitialData() {
        if (gitRepositories.length === 0 || !panel) {
            return;
        }
        
        try {
            console.log('Loading initial data for repository:', gitRepositories[0]);
            
            // First load repository branches and get current branch
            const firstRepo = gitRepositories[0];
            const currentBranch = await handleRepositoryChanged(firstRepo, true);
            
            console.log('Loading statistics for branch:', currentBranch);
            
            // Substituir o uso de "all" por uma data específica
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            const startDate = oneMonthAgo.toISOString().split('T')[0];

            await refreshGitStats(
                firstRepo, 
                startDate,  // Em vez de "all"
                new Date().toISOString().split('T')[0],  // Today
                currentBranch
            );
        } catch (error) {
            console.error('Error loading initial data:', error);
            throw error;
        }
    }
}

export function deactivate() {}
