// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webview/gitStatsView';
import { GitService } from './gitService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Extensão "gitstats" está ativa!');

    const gitService = new GitService();
    let panel: vscode.WebviewPanel | undefined = undefined;

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('gitstats.helloWorld', async () => {
        // Se já existe um painel, foca nele em vez de criar outro
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Cria um novo painel webview
        panel = vscode.window.createWebviewPanel(
            'gitStats',
            'Git Stats',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'media'))
                ]
            }
        );

        // Renderiza a interface inicial (sem dados)
        updateWebviewContent();

        // Limpa a referência quando o painel for fechado
        panel.onDidDispose(
            () => {
                panel = undefined;
            },
            null,
            context.subscriptions
        );

        // Manipula mensagens do webview
        panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'workspace-changed':
                        try {
                            await handleWorkspaceChanged(message.workspacePath);
                        } catch (error) {
                            showError(`Erro ao mudar workspace: ${error}`);
                        }
                        break;

                    case 'refresh-stats':
                        try {
                            await refreshGitStats(
                                message.workspacePath,
                                message.startDate,
                                message.endDate,
                                message.branch
                            );
                        } catch (error) {
                            showError(`Erro ao atualizar estatísticas: ${error}`);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);

    // Atualiza o conteúdo do webview
    function updateWebviewContent(stats?: any) {
        if (panel) {
            panel.webview.html = getWebviewContent(
                context,
                panel.webview,
                vscode.workspace.workspaceFolders,
                stats
            );
        }
    }

    // Mostra mensagens de erro
    function showError(message: string) {
        vscode.window.showErrorMessage(message);
    }

    // Manipula mudança de workspace
    async function handleWorkspaceChanged(workspacePath: string) {
        if (!panel) return;

        try {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Carregando branches...",
                    cancellable: false
                },
                async () => {
                    // Obtém o branch atual e os branches disponíveis
                    const currentBranch = await gitService.getCurrentBranch(workspacePath);
                    const branches = await gitService.getBranches(workspacePath);

                    // Atualiza o webview só com informações de branch (sem estatísticas completas)
                    updateWebviewContent({
                        branches,
                        branch: currentBranch
                    });
                }
            );
        } catch (error) {
            console.error('Erro ao mudar workspace:', error);
            throw error;
        }
    }

    // Atualiza estatísticas Git
    async function refreshGitStats(
        workspacePath: string,
        startDate: string,
        endDate: string,
        branch: string
    ) {
        if (!panel) return;

        try {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "Gerando estatísticas Git...",
                    cancellable: false
                },
                async () => {
                    // Gera estatísticas Git
                    const stats = await gitService.getGitStats(
                        workspacePath,
                        startDate,
                        endDate,
                        branch
                    );

                    // Atualiza a interface com as estatísticas
                    updateWebviewContent(stats);
                }
            );
        } catch (error) {
            console.error('Erro ao gerar estatísticas:', error);
            throw error;
        }
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}
