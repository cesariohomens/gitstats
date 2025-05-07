import * as vscode from 'vscode';
import * as path from 'path';
import { GitStats } from '../gitService';

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getWebviewContent(
    context: vscode.ExtensionContext,
    webview: vscode.Webview, 
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
    gitStats?: GitStats
) {
    // Criar URI para recursos locais
    const chartJsUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'src', 'media', 'chart.min.js'))
    );

    // Gerar nonce para segurança
    const nonce = getNonce();

    // Gerar opções para o selector de workspace
    const workspaceOptions = workspaceFolders 
        ? workspaceFolders
            .map(folder => `<option value="${folder.uri.fsPath}">${folder.name}</option>`)
            .join('')
        : '';

    // Gerar opções para o selector de branches
    const branchOptions = gitStats && gitStats.branches
        ? gitStats.branches
            .map(branch => `<option value="${branch}" ${branch === gitStats.branch ? 'selected' : ''}>${branch}</option>`)
            .join('')
        : '<option value="">Selecione um workspace</option>';

    // Configurar datas padrão
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    const defaultStartDate = gitStats?.startDate && gitStats.startDate !== "Beginning"
        ? gitStats.startDate
        : oneMonthAgo.toISOString().split('T')[0];
    
    const defaultEndDate = gitStats?.endDate && gitStats.endDate !== "Now"
        ? gitStats.endDate
        : today.toISOString().split('T')[0];

    // Preparar dados para os gráficos se disponíveis
    const statsJson = gitStats 
        ? JSON.stringify({
            authorNames: gitStats.authorNames,
            addedLines: gitStats.addedLines,
            removedLines: gitStats.removedLines,
            netLines: gitStats.netLines,
            commitsByDate: gitStats.commitsByDate,
            dateList: gitStats.dateList
        }) 
        : 'null';

    // O conteúdo HTML do webview
    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Git Stats</title>
    <style>
        :root {
            --container-padding: 20px;
            --input-padding: 6px;
            --gap: 10px;
        }
        body {
            padding: 0 var(--container-padding);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
        }
        .container {
            max-width: 100%;
            margin: 0 auto;
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            font-size: 1.5em;
            margin-bottom: 20px;
        }
        h2 {
            font-size: 1.3em;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        .controls {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--gap);
            margin-bottom: 20px;
        }
        .control-group {
            display: flex;
            flex-direction: column;
            margin-bottom: 10px;
        }
        .control-group label {
            margin-bottom: 5px;
        }
        select, input {
            padding: var(--input-padding);
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
        }
        .tab {
            padding: 10px 15px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        .tab.active {
            border-color: var(--vscode-textLink-activeForeground);
            color: var(--vscode-textLink-activeForeground);
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .chart-container {
            height: 400px;
            position: relative;
            margin-bottom: 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            padding: 8px;
            text-align: left;
            border: 1px solid var(--vscode-panel-border);
        }
        th {
            background-color: var(--vscode-panel-border);
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        .refresh-button-container {
            display: flex;
            align-items: flex-end;
        }
        .refresh-button-container button {
            margin-bottom: 10px;
        }
        #no-data-message {
            text-align: center;
            margin: 50px 0;
            font-style: italic;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Git Statistics</h1>
        
        <div class="controls">
            <div class="control-group">
                <label for="workspace-selector">Workspace:</label>
                <select id="workspace-selector">
                    ${workspaceOptions}
                </select>
            </div>
            
            <div class="control-group">
                <label for="branch-selector">Branch:</label>
                <select id="branch-selector">
                    ${branchOptions}
                </select>
            </div>
            
            <div class="control-group">
                <label for="start-date">Data Início:</label>
                <input type="date" id="start-date" value="${defaultStartDate}">
            </div>
            
            <div class="control-group">
                <label for="end-date">Data Fim:</label>
                <input type="date" id="end-date" value="${defaultEndDate}">
            </div>
            
            <div class="refresh-button-container">
                <button id="refresh-stats-btn">Atualizar Estatísticas</button>
            </div>
        </div>
        
        <div id="stats-content">
            <div class="tabs">
                <div class="tab active" data-tab="commits">Commits por Dia</div>
                <div class="tab" data-tab="lines">Linhas Modificadas</div>
                <div class="tab" data-tab="tables">Tabelas Detalhadas</div>
            </div>
            
            <div id="no-data-message">
                Selecione um workspace, branch e intervalo de datas, e clique em "Atualizar Estatísticas" para visualizar os dados.
            </div>
            
            <div id="tab-commits" class="tab-content active">
                <div class="chart-container">
                    <canvas id="commits-chart"></canvas>
                </div>
            </div>
            
            <div id="tab-lines" class="tab-content">
                <div class="chart-container">
                    <canvas id="lines-chart"></canvas>
                </div>
            </div>
            
            <div id="tab-tables" class="tab-content">
                <h2>Commits por Autor e Data</h2>
                <div id="commits-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Autor</th>
                                <th>Email</th>
                                <th>Commits</th>
                            </tr>
                        </thead>
                        <tbody id="commits-table-body"></tbody>
                    </table>
                </div>
                
                <h2>Linhas Modificadas por Autor</h2>
                <div id="lines-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Autor</th>
                                <th>Email</th>
                                <th>Linhas Adicionadas</th>
                                <th>Linhas Removidas</th>
                                <th>Linhas Líquidas</th>
                            </tr>
                        </thead>
                        <tbody id="lines-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <script nonce="${nonce}" src="${chartJsUri}"></script>
    <script nonce="${nonce}">
        (function() {
            // Comunicação com VSCode
            const vscode = acquireVsCodeApi();
            
            // Dados de estatísticas Git
            const gitStats = ${statsJson};
            
            // Elementos importantes
            const workspaceSelector = document.getElementById('workspace-selector');
            const branchSelector = document.getElementById('branch-selector');
            const startDateInput = document.getElementById('start-date');
            const endDateInput = document.getElementById('end-date');
            const refreshButton = document.getElementById('refresh-stats-btn');
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            const noDataMessage = document.getElementById('no-data-message');
            
            // Referências aos gráficos
            let commitsChart = null;
            let linesChart = null;
            
            // Inicialização
            function initialize() {
                setupEventListeners();
                
                // Mostrar mensagem se não houver dados
                if (!gitStats) {
                    noDataMessage.style.display = 'block';
                } else {
                    noDataMessage.style.display = 'none';
                    renderCharts();
                    populateTables();
                }
            }
            
            // Configurar event listeners
            function setupEventListeners() {
                // Mudança de workspace
                workspaceSelector.addEventListener('change', () => {
                    const workspacePath = workspaceSelector.value;
                    vscode.postMessage({
                        command: 'workspace-changed',
                        workspacePath
                    });
                });
                
                // Atualizar estatísticas
                refreshButton.addEventListener('click', () => {
                    const workspacePath = workspaceSelector.value;
                    const branch = branchSelector.value;
                    const startDate = startDateInput.value;
                    const endDate = endDateInput.value;
                    
                    vscode.postMessage({
                        command: 'refresh-stats',
                        workspacePath,
                        branch,
                        startDate,
                        endDate
                    });
                });
                
                // Tabs
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabId = tab.getAttribute('data-tab');
                        
                        // Atualizar estado ativo das tabs
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        
                        // Mostrar conteúdo da tab selecionada
                        tabContents.forEach(content => {
                            content.classList.remove('active');
                        });
                        document.getElementById('tab-' + tabId).classList.add('active');
                    });
                });
            }
            
            // Gerar cores distintas para os gráficos
            function generateDistinctColors(n) {
                const colors = [];
                for (let i = 0; i < n; i++) {
                    const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                    if (!colors.includes(color)) {
                        colors.push(color);
                    } else {
                        i--; // Tentar novamente
                    }
                }
                return colors;
            }
            
            // Renderizar gráficos
            function renderCharts() {
                if (!gitStats) return;
                
                renderCommitsChart();
                renderLinesChart();
            }
            
            // Renderizar gráfico de commits
            function renderCommitsChart() {
                // Destruir gráfico existente se houver
                if (commitsChart) {
                    commitsChart.destroy();
                }
                
                const ctx = document.getElementById('commits-chart').getContext('2d');
                const authorEmails = Object.keys(gitStats.authorNames);
                const colors = generateDistinctColors(authorEmails.length);
                
                // Preparar datasets para cada autor
                const datasets = authorEmails.map((email, index) => {
                    const data = gitStats.dateList.map(date => {
                        return gitStats.commitsByDate[date] && gitStats.commitsByDate[date][email]
                            ? gitStats.commitsByDate[date][email]
                            : 0;
                    });
                    
                    return {
                        label: gitStats.authorNames[email],
                        data: data,
                        borderColor: colors[index],
                        backgroundColor: colors[index],
                        fill: false
                    };
                });
                
                // Criar gráfico
                commitsChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: gitStats.dateList,
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Commits por Dia por Autor'
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false
                            },
                            legend: {
                                position: 'bottom'
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Data'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Número de Commits'
                                },
                                beginAtZero: true,
                                ticks: {
                                    precision: 0
                                }
                            }
                        }
                    }
                });
            }
            
            // Renderizar gráfico de linhas modificadas
            function renderLinesChart() {
                // Destruir gráfico existente se houver
                if (linesChart) {
                    linesChart.destroy();
                }
                
                const ctx = document.getElementById('lines-chart').getContext('2d');
                const authorEmails = Object.keys(gitStats.authorNames);
                const colors = generateDistinctColors(authorEmails.length);
                
                // Preparar dados
                const labels = authorEmails.map(email => gitStats.authorNames[email]);
                const addedData = authorEmails.map(email => gitStats.addedLines[email] || 0);
                const removedData = authorEmails.map(email => gitStats.removedLines[email] || 0);
                const netData = authorEmails.map(email => gitStats.netLines[email] || 0);
                
                // Criar gráfico
                linesChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Linhas Adicionadas',
                                data: addedData,
                                backgroundColor: colors.map(color => color + 'CC'), // Adiciona transparência
                                borderWidth: 1
                            },
                            {
                                label: 'Linhas Removidas',
                                data: removedData.map(val => -val), // Negativo para visualização
                                backgroundColor: colors.map(color => color + '88'),
                                borderWidth: 1
                            },
                            {
                                label: 'Linhas Líquidas',
                                data: netData,
                                backgroundColor: colors.map(color => color + '44'),
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Linhas de Código Modificadas por Autor'
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        let value = context.raw;
                                        
                                        // Mostrar valores absolutos para linhas removidas
                                        if (context.dataset.label === 'Linhas Removidas') {
                                            value = Math.abs(value);
                                        }
                                        
                                        return label + ': ' + value;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Autor'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Linhas de Código'
                                }
                            }
                        }
                    }
                });
            }
            
            // Preencher tabelas
            function populateTables() {
                if (!gitStats) return;
                
                populateCommitsTable();
                populateLinesTable();
            }
            
            // Preencher tabela de commits
            function populateCommitsTable() {
                const tableBody = document.getElementById('commits-table-body');
                tableBody.innerHTML = '';
                
                for (const date of gitStats.dateList) {
                    if (gitStats.commitsByDate[date]) {
                        for (const email in gitStats.commitsByDate[date]) {
                            const row = document.createElement('tr');
                            
                            // Data
                            const dateCell = document.createElement('td');
                            dateCell.textContent = date;
                            row.appendChild(dateCell);
                            
                            // Autor
                            const authorCell = document.createElement('td');
                            authorCell.textContent = gitStats.authorNames[email];
                            row.appendChild(authorCell);
                            
                            // Email
                            const emailCell = document.createElement('td');
                            emailCell.textContent = email;
                            row.appendChild(emailCell);
                            
                            // Commits
                            const commitsCell = document.createElement('td');
                            commitsCell.textContent = gitStats.commitsByDate[date][email];
                            row.appendChild(commitsCell);
                            
                            tableBody.appendChild(row);
                        }
                    }
                }
            }
            
            // Preencher tabela de linhas
            function populateLinesTable() {
                const tableBody = document.getElementById('lines-table-body');
                tableBody.innerHTML = '';
                
                const authorEmails = Object.keys(gitStats.authorNames);
                
                for (const email of authorEmails) {
                    const row = document.createElement('tr');
                    
                    // Autor
                    const authorCell = document.createElement('td');
                    authorCell.textContent = gitStats.authorNames[email];
                    row.appendChild(authorCell);
                    
                    // Email
                    const emailCell = document.createElement('td');
                    emailCell.textContent = email;
                    row.appendChild(emailCell);
                    
                    // Linhas adicionadas
                    const addedCell = document.createElement('td');
                    addedCell.textContent = gitStats.addedLines[email] || 0;
                    row.appendChild(addedCell);
                    
                    // Linhas removidas
                    const removedCell = document.createElement('td');
                    removedCell.textContent = gitStats.removedLines[email] || 0;
                    row.appendChild(removedCell);
                    
                    // Linhas líquidas
                    const netCell = document.createElement('td');
                    netCell.textContent = gitStats.netLines[email] || 0;
                    row.appendChild(netCell);
                    
                    tableBody.appendChild(row);
                }
            }
            
            // Inicializar a aplicação
            initialize();
        })();
    </script>
</body>
</html>`;
}