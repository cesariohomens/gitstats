import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { format } from 'date-fns';

export interface GitCommitData {
    date: string;
    author: string;
    email: string;
    added: number;
    removed: number;
    net: number;
}

export interface GitStats {
    workspacePath?: string;   // Add this property
    branches: { [name: string]: {type: 'local' | 'remote', fullName: string} };
    authorNames: { [email: string]: string };
    addedLines: { [email: string]: number };
    removedLines: { [email: string]: number };
    netLines: { [email: string]: number };
    commitsByDate: { [date: string]: { [email: string]: number } };
    dateList: string[];
    startDate?: string;
    endDate?: string;
    branch?: string;
}

export class GitService {
    /**
     * Executes a Git command in the specified workspace
     */
    private executeGitCommand(workspacePath: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            // Use child_process.spawn instead of exec to avoid shell interpretation issues
            const gitProcess = child_process.spawn('git', args, { 
                cwd: workspacePath,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            gitProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            gitProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            gitProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Git error: ${stderr}`));
                    return;
                }
                resolve(stdout);
            });
        });
    }

    /**
     * Gets the current branch
     */
    public async getCurrentBranch(workspacePath: string): Promise<string> {
        try {
            const output = await this.executeGitCommand(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
            return output.trim();
        } catch (error) {
            console.error('Error getting current branch:', error);
            throw error;
        }
    }

    /**
     * Checks if a repository exists in the workspace
     */
    public async isGitRepository(workspacePath: string): Promise<boolean> {
        try {
            await this.executeGitCommand(workspacePath, ['rev-parse', '--git-dir']);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Checks if a branch exists
     */
    public async branchExists(workspacePath: string, branch: string): Promise<boolean> {
        try {
            await this.executeGitCommand(workspacePath, ['show-ref', '--quiet', '--verify', `refs/heads/${branch}`]);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Gets all available branches (both local and remote)
     */
    public async getBranches(workspacePath: string): Promise<{ [name: string]: {type: 'local' | 'remote', fullName: string} }> {
        const branches: { [name: string]: {type: 'local' | 'remote', fullName: string} } = {};
        
        try {
            // Get local branches
            const localOutput = await this.executeGitCommand(workspacePath, ['branch']);
            localOutput
                .split('\n')
                .filter(line => line.trim().length > 0)
                .forEach(line => {
                    const branchName = line.replace('*', '').trim();
                    branches[branchName] = { 
                        type: 'local',
                        fullName: branchName 
                    };
                });
                
            // Get remote branches
            const remoteOutput = await this.executeGitCommand(workspacePath, ['branch', '-r']);
            remoteOutput
                .split('\n')
                .filter(line => line.trim().length > 0)
                .forEach(line => {
                    const fullName = line.trim();
                    // Skip HEAD references
                    if (fullName.includes('HEAD ->')) return;
                    
                    const parts = fullName.split('/');
                    // Format: origin/main
                    if (parts.length >= 2) {
                        const remote = parts[0];
                        const branchName = parts.slice(1).join('/');
                        const displayName = `${branchName} (${remote})`;
                        
                        branches[displayName] = {
                            type: 'remote',
                            fullName: fullName
                        };
                    }
                });
                
            return branches;
        } catch (error) {
            console.error('Error getting branches:', error);
            return {};
        }
    }

    /**
     * Generates a sequence of dates between two dates
     */
    private generateDateRange(startDate: Date, endDate: Date): string[] {
        const dates: string[] = [];
        const current = new Date(startDate);
        
        // Include the full end day
        endDate.setHours(23, 59, 59, 999);
        
        while (current <= endDate) {
            dates.push(format(current, 'yyyy-MM-dd'));
            current.setDate(current.getDate() + 1);
        }
        
        return dates;
    }

    /**
     * Generates distinct colors for charts
     */
    public generateDistinctColors(n: number): string[] {
        const colors: string[] = [];
        for (let i = 0; i < n; i++) {
            const color = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
            if (!colors.includes(color)) {
                colors.push(color);
            } else {
                i--; // try again
            }
        }
        return colors;
    }

    /**
     * Runs git log with specified parameters
     */
    private async runGitLog(workspacePath: string, dateRange: string | null, branch: string): Promise<string> {
        const command = ['log'];
        
        // Add branch to command
        command.push(branch);
        
        // Handle date range parameters
        if (dateRange) {
            // Parse date range parameters correctly
            if (dateRange.includes('--after=')) {
                command.push(dateRange.split(' ')[0]);
            }
            if (dateRange.includes('--before=')) {
                command.push(dateRange.split(' ').length > 1 ? dateRange.split(' ')[1] : dateRange);
            }
        }
        
        // Format options
        command.push('--pretty=format:--SPLIT--%n%ad%n%an <%ae>');
        command.push('--date=short');
        command.push('--numstat');
        
        console.log('Running git command:', 'git', command.join(' '));
        return this.executeGitCommand(workspacePath, command);
    }

    /**
     * Generates Git statistics for specified dates and branch
     */
    public async getGitStats(
        workspacePath: string, 
        startDateArg: string | null,
        endDateArg: string | null,
        branchName: string | null
    ): Promise<GitStats> {
        // If no branch specified, use the current one
        if (!branchName) {
            branchName = await this.getCurrentBranch(workspacePath);
        }

        // For remote branches, we don't need to check if they exist
        if (!branchName.includes('/')) {
            // Check if branch exists
            const branchExists = await this.branchExists(workspacePath, branchName);
            if (!branchExists) {
                throw new Error(`Branch '${branchName}' does not exist.`);
            }
        }

        // Configure date range
        let dateRange: string | null = null;
        let dateList: string[] | null = null;
        let startDate: string = "Beginning";
        let endDate: string = "Now";

        // Handle the "all" option for startDateArg to include from branch creation
        if (startDateArg === "all") {
            dateRange = endDateArg ? `--before=${endDateArg}` : null;
            startDate = "Beginning";
        } else if (startDateArg && startDateArg !== "all" && 
            endDateArg && endDateArg !== "all") {
            dateRange = `--after=${startDateArg} --before=${endDateArg}`;
            const startDt = new Date(startDateArg);
            const endDt = new Date(endDateArg);
            dateList = this.generateDateRange(startDt, endDt);
            startDate = startDateArg;
            endDate = endDateArg;
        }

        // Execute git log
        const output = await this.runGitLog(workspacePath, dateRange, branchName);

        // Process results
        const addedLines: { [email: string]: number } = {};
        const removedLines: { [email: string]: number } = {};
        const netLines: { [email: string]: number } = {};
        const authorNames: { [email: string]: string } = {};
        const commitsByDate: { [date: string]: { [email: string]: number } } = {};

        // Split output by commits
        const commits = output.split('--SPLIT--');
        for (const commit of commits) {
            const lines = commit.trim().split('\n');
            if (lines.length < 2) continue;

            const date = lines[0].trim();
            const authorLine = lines[1].trim();
            const match = authorLine.match(/(.*) <(.*)>/);
            if (!match) continue;

            const [, name, email] = match;
            authorNames[email] = name;

            // Initialize if necessary
            if (!commitsByDate[date]) {
                commitsByDate[date] = {};
            }
            
            // Increment commit counter
            commitsByDate[date][email] = (commitsByDate[date][email] || 0) + 1;

            // Process line statistics
            for (let i = 2; i < lines.length; i++) {
                const parts = lines[i].trim().split('\t');
                if (parts.length === 3) {
                    try {
                        const added = parts[0] !== '-' ? parseInt(parts[0], 10) : 0;
                        const removed = parts[1] !== '-' ? parseInt(parts[1], 10) : 0;

                        addedLines[email] = (addedLines[email] || 0) + added;
                        removedLines[email] = (removedLines[email] || 0) + removed;
                        netLines[email] = (netLines[email] || 0) + (added - removed);
                    } catch (error) {
                        // Ignore lines with invalid format
                    }
                }
            }
        }

        // If dates weren't specified, use commit dates
        if (dateList === null) {
            dateList = Object.keys(commitsByDate).sort();
            if (dateList.length > 0) {
                startDate = dateList[0];
                endDate = dateList[dateList.length - 1];
            }
        }

        // Get all branches
        const branches = await this.getBranches(workspacePath);

        return {
            workspacePath,
            branches,
            authorNames,
            addedLines,
            removedLines,
            netLines,
            commitsByDate,
            dateList,
            startDate,
            endDate,
            branch: branchName
        };
    }
}