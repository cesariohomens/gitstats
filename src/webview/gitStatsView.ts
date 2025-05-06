import * as vscode from 'vscode';

export function getWebviewContent() {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Git Stats</title>
        <style>
            body {
                padding: 20px;
                color: var(--vscode-editor-foreground);
                font-family: var(--vscode-font-family);
                background-color: var(--vscode-editor-background);
            }
            .container {
                max-width: 800px;
                margin: 0 auto;
            }
            h1 {
                color: var(--vscode-textLink-foreground);
                font-size: 1.5em;
            }
            .stats-container {
                margin-top: 20px;
                padding: 15px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 5px;
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 2px;
                cursor: pointer;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Git Stats</h1>
            <div class="stats-container">
                <p>Welcome to Git Stats extension!</p>
                <p>This is your custom interface for viewing git statistics.</p>
                <p>Here you will be able to see statistics about your git repository and contributors.</p>
            </div>
            <button id="refresh-btn">Refresh Stats</button>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            document.getElementById('refresh-btn').addEventListener('click', () => {
                vscode.postMessage({
                    command: 'refresh'
                });
            });
        </script>
    </body>
    </html>`;
}