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
    gitRepos: string[] = [],
    gitStats?: GitStats
) {
    // Create URI for local resources
    const chartJsUri = webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'src', 'media', 'chart.min.js'))
    );

    // Generate nonce for security
    const nonce = getNonce();

    // Generate workspace folder options for the dropdown
    const workspaceOptions = workspaceFolders 
        ? workspaceFolders
            .filter(folder => gitRepos.includes(folder.uri.fsPath))
            .map(folder => `<option value="${folder.uri.fsPath}" ${gitStats && folder.uri.fsPath === gitStats.workspacePath ? 'selected' : ''}>${folder.name}</option>`)
            .join('')
        : '';

    // Generate branch options for the dropdown
    const branchOptions = gitStats && gitStats.branches
        ? Object.entries(gitStats.branches)
            .map(([branchName, details]) => {
                const icon = details.type === 'local' ? '🔹' : '🔸';
                return `<option value="${details.fullName}" ${branchName === gitStats.branch ? 'selected' : ''}>${icon} ${branchName}</option>`;
            })
            .join('')
        : '<option value="">Loading branches...</option>';

    // Configure default dates
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    // Add a date picker with "From Branch Creation" option
    const startDateOptions = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="date" id="start-date" value="${gitStats?.startDate && gitStats.startDate !== "Beginning" ? gitStats.startDate : oneMonthAgo.toISOString().split('T')[0]}">
            <div>
                <label>
                    <input type="checkbox" id="from-beginning-checkbox" ${gitStats?.startDate === "Beginning" ? "checked" : ""}>
                    From Branch Creation
                </label>
            </div>
        </div>
    `;

    const defaultEndDate = gitStats?.endDate && gitStats.endDate !== "Now"
        ? gitStats.endDate
        : today.toISOString().split('T')[0];

    // Prepare data for charts if available
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

    // HTML content for the webview
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
        #no-data-message {
            text-align: center;
            margin: 50px 0;
            font-style: italic;
            display: none;
        }
        .repo-info {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-top: -10px;
            margin-bottom: 15px;
        }
        .legend {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            font-size: 0.9em;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .loading-indicator {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--vscode-progressBar-background);
            animation: loading 1.5s infinite ease-in-out;
            transform-origin: 0 0;
            display: none;
        }

        @keyframes loading {
            0% { transform: scaleX(0); }
            50% { transform: scaleX(0.5); }
            100% { transform: scaleX(1); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Git Statistics</h1>
        
        <div class="controls">
            <div class="control-group">
                <label for="repository-selector">Repository:</label>
                <select id="repository-selector">
                    ${workspaceOptions}
                </select>
            </div>
            
            <div class="control-group">
                <label for="branch-selector">Branch:</label>
                <select id="branch-selector">
                    ${branchOptions}
                </select>
                <div class="legend">
                    <div class="legend-item"><span>🔹</span> Local</div>
                    <div class="legend-item"><span>🔸</span> Remote</div>
                </div>
            </div>
            
            <div class="control-group">
                <label for="start-date">Start Date:</label>
                ${startDateOptions}
            </div>
            
            <div class="control-group">
                <label for="end-date">End Date:</label>
                <input type="date" id="end-date" value="${defaultEndDate}">
            </div>
        </div>
        
        <div id="stats-content">
            <div class="tabs">
                <div class="tab active" data-tab="commits">Commits Per Day</div>
                <div class="tab" data-tab="lines">Modified Lines</div>
                <div class="tab" data-tab="tables">Detailed Tables</div>
            </div>
            
            <div id="no-data-message">
                Select a repository, branch, and date range, then click "Update Statistics" to view data.
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
                <h2>Lines Modified by Author</h2>
                <div id="lines-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Author</th>
                                <th>Email</th>
                                <th>Added Lines</th>
                                <th>Removed Lines</th>
                                <th>Net Lines</th>
                            </tr>
                        </thead>
                        <tbody id="lines-table-body"></tbody>
                    </table>
                </div>
                
                <h2>Commits by Author and Date</h2>
                <div id="commits-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Author</th>
                                <th>Email</th>
                                <th>Commits</th>
                            </tr>
                        </thead>
                        <tbody id="commits-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <div class="loading-indicator" id="loading"></div>

    <script nonce="${nonce}" src="${chartJsUri}"></script>
    <script nonce="${nonce}">
        (function() {
            // Communication with VSCode
            const vscode = acquireVsCodeApi();
            
            // Git statistics data
            const gitStats = ${statsJson};
            
            // Important elements
            const repositorySelector = document.getElementById('repository-selector');
            const branchSelector = document.getElementById('branch-selector');
            const startDateInput = document.getElementById('start-date');
            const fromBeginningCheckbox = document.getElementById('from-beginning-checkbox');
            const endDateInput = document.getElementById('end-date');
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            const noDataMessage = document.getElementById('no-data-message');
            const loadingIndicator = document.getElementById('loading');
            
            // Chart references
            let commitsChart = null;
            let linesChart = null;
            
            // Debounce function to prevent multiple rapid calls
            function debounce(func, wait) {
                let timeout;
                return function(...args) {
                    const context = this;
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(context, args), wait);
                };
            }

            // Initialization
            function initialize() {
                setupEventListeners();
                
                // Initialize checkbox state if it exists
                if (fromBeginningCheckbox) {
                    startDateInput.disabled = fromBeginningCheckbox.checked;
                }
                
                // Show message if no data
                if (!gitStats) {
                    noDataMessage.style.display = 'block';
                } else {
                    noDataMessage.style.display = 'none';
                    renderCharts();
                    populateTables();
                }
                
                // Notify the extension that the webview is ready
                vscode.postMessage({
                    command: 'extension-ready'
                });
            }
            
            // Set up event listeners
            function setupEventListeners() {
                // Repository change
                repositorySelector.addEventListener('change', () => {
                    const repositoryPath = repositorySelector.value;
                    vscode.postMessage({
                        command: 'repository-changed',
                        repositoryPath
                    });
                });
                
                // Branch change - automatically refresh stats
                branchSelector.addEventListener('change', () => {
                    debouncedRefresh();
                });
                
                // From beginning checkbox
                if (fromBeginningCheckbox) {
                    fromBeginningCheckbox.addEventListener('change', () => {
                        startDateInput.disabled = fromBeginningCheckbox.checked;
                        debouncedRefresh(); // Automatically refresh when checkbox changes
                    });
                }
                
                // Start date change
                startDateInput.addEventListener('change', () => {
                    debouncedRefresh();
                });
                
                // End date change
                endDateInput.addEventListener('change', () => {
                    debouncedRefresh();
                });
                
                // Tabs
                tabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabId = tab.getAttribute('data-tab');
                        
                        // Update active state of tabs
                        tabs.forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        
                        // Show content of selected tab
                        tabContents.forEach(content => {
                            content.classList.remove('active');
                        });
                        document.getElementById('tab-' + tabId).classList.add('active');
                    });
                });
                
                // Helper function to refresh stats
                function refreshStats() {
                    const repositoryPath = repositorySelector.value;
                    const branch = branchSelector.value;
                    const startDate = fromBeginningCheckbox && fromBeginningCheckbox.checked ? "all" : startDateInput.value;
                    const endDate = endDateInput.value;
                    
                    // Only refresh if we have all the necessary values
                    if (repositoryPath && branch) {
                        setLoading(true); // Show loading indicator
                        vscode.postMessage({
                            command: 'refresh-stats',
                            repositoryPath,
                            branch,
                            startDate,
                            endDate
                        });
                    }
                }

                const debouncedRefresh = debounce(refreshStats, 300);
            }
            
            // Function to show/hide loading indicator
            function setLoading(isLoading) {
                loadingIndicator.style.display = isLoading ? 'block' : 'none';
            }

            // Handle message from extension to hide loading indicator
            window.addEventListener('message', (event) => {
                const message = event.data;
                if (message.command === 'stats-updated') {
                    setLoading(false);
                }
            });

            // Generate distinct colors for charts
            function generateDistinctColors(n) {
                const colors = [];
                for (let i = 0; i < n; i++) {
                    const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                    if (!colors.includes(color)) {
                        colors.push(color);
                    } else {
                        i--; // Try again
                    }
                }
                return colors;
            }
            
            // Render charts
            function renderCharts() {
                if (!gitStats) return;
                
                // Clear any existing charts first
                if (commitsChart) {
                    commitsChart.destroy();
                    commitsChart = null;
                }
                
                if (linesChart) {
                    linesChart.destroy();
                    linesChart = null;
                }
                
                // Now render new charts
                renderCommitsChart();
                renderLinesChart();
            }
            
            // Render commits chart
            function renderCommitsChart() {
                // Destroy existing chart if any
                if (commitsChart) {
                    commitsChart.destroy();
                }
                
                const ctx = document.getElementById('commits-chart').getContext('2d');
                const authorEmails = Object.keys(gitStats.authorNames);
                const colors = generateDistinctColors(authorEmails.length);
                
                // Prepare datasets for each author
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
                
                // Create chart
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
                                text: 'Commits Per Day by Author'
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
                                    text: 'Date'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Number of Commits'
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
            
            // Render modified lines chart
            function renderLinesChart() {
                // Destroy existing chart if any
                if (linesChart) {
                    linesChart.destroy();
                }
                
                const ctx = document.getElementById('lines-chart').getContext('2d');
                const authorEmails = Object.keys(gitStats.authorNames);
                const colors = generateDistinctColors(authorEmails.length);
                
                // Prepare data
                const labels = authorEmails.map(email => gitStats.authorNames[email]);
                const addedData = authorEmails.map(email => gitStats.addedLines[email] || 0);
                const removedData = authorEmails.map(email => gitStats.removedLines[email] || 0);
                const netData = authorEmails.map(email => gitStats.netLines[email] || 0);
                
                // Create chart
                linesChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Added Lines',
                                data: addedData,
                                backgroundColor: colors.map(color => color + 'CC'), // Add transparency
                                borderWidth: 1
                            },
                            {
                                label: 'Removed Lines',
                                data: removedData.map(val => -val), // Negative for visualization
                                backgroundColor: colors.map(color => color + '88'),
                                borderWidth: 1
                            },
                            {
                                label: 'Net Lines',
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
                                text: 'Lines of Code Modified by Author'
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        let value = context.raw;
                                        
                                        // Show absolute values for removed lines
                                        if (context.dataset.label === 'Removed Lines') {
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
                                    text: 'Author'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Lines of Code'
                                }
                            }
                        }
                    }
                });
            }
            
            // Populate tables
            function populateTables() {
                if (!gitStats) return;
                
                populateCommitsTable();
                populateLinesTable();
            }
            
            // Populate commits table
            function populateCommitsTable() {
                const tableBody = document.getElementById('commits-table-body');
                tableBody.innerHTML = '';
                
                for (const date of gitStats.dateList) {
                    if (gitStats.commitsByDate[date]) {
                        for (const email in gitStats.commitsByDate[date]) {
                            const row = document.createElement('tr');
                            
                            // Date
                            const dateCell = document.createElement('td');
                            dateCell.textContent = date;
                            row.appendChild(dateCell);
                            
                            // Author
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
            
            // Populate lines table
            function populateLinesTable() {
                const tableBody = document.getElementById('lines-table-body');
                tableBody.innerHTML = '';
                
                const authorEmails = Object.keys(gitStats.authorNames);
                
                for (const email of authorEmails) {
                    const row = document.createElement('tr');
                    
                    // Author
                    const authorCell = document.createElement('td');
                    authorCell.textContent = gitStats.authorNames[email];
                    row.appendChild(authorCell);
                    
                    // Email
                    const emailCell = document.createElement('td');
                    emailCell.textContent = email;
                    row.appendChild(emailCell);
                    
                    // Added lines
                    const addedCell = document.createElement('td');
                    addedCell.textContent = gitStats.addedLines[email] || 0;
                    row.appendChild(addedCell);
                    
                    // Removed lines
                    const removedCell = document.createElement('td');
                    removedCell.textContent = gitStats.removedLines[email] || 0;
                    row.appendChild(removedCell);
                    
                    // Net lines
                    const netCell = document.createElement('td');
                    netCell.textContent = gitStats.netLines[email] || 0;
                    row.appendChild(netCell);
                    
                    tableBody.appendChild(row);
                }
            }
            
            // Initialize the application
            initialize();
        })();
    </script>
</body>
</html>`;
}