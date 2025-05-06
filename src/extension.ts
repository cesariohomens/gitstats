// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getWebviewContent } from './webview/gitStatsView';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "gitstats" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('gitstats.helloWorld', () => {
        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'gitStats', // Identifies the type of the webview. Used internally
            'Git Stats', // Title displayed in the UI
            vscode.ViewColumn.One, // Editor column to show the webview panel in
            {
                // Enable JavaScript in the webview
                enableScripts: true
            }
        );

        // Set the webview's HTML content
        panel.webview.html = getWebviewContent();

        // Display a message box to the user as well
        vscode.window.showInformationMessage('Hello World from gitstats!');
    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
