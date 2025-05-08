import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { format } from 'date-fns';

interface GitCommitData {
    date: string;
    author: string;
    email: string;
    added: number;
    removed: number;
    net: number;
}

export interface GitStats {
    workspacePath?: string;
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
    private async executeGitCommand(workspacePath: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const gitProcess = childProcess.spawn('git', args, { 
                cwd: workspacePath,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            gitProcess.stdout.on('data', (data) => stdout += data.toString());
            gitProcess.stderr.on('data', (data) => stderr += data.toString());
            
            gitProcess.on('close', (code) => {
                code !== 0 ? reject(new Error(`Git error: ${stderr}`)) : resolve(stdout);
            });
        });
    }

    public async getCurrentBranch(workspacePath: string): Promise<string> {
        const output = await this.executeGitCommand(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        return output.trim();
    }

    public async isGitRepository(workspacePath: string): Promise<boolean> {
        try {
            await this.executeGitCommand(workspacePath, ['rev-parse', '--git-dir']);
            return true;
        } catch {
            return false;
        }
    }

    public async getBranches(workspacePath: string): Promise<{ [name: string]: {type: 'local' | 'remote', fullName: string} }> {
        const branches: { [name: string]: {type: 'local' | 'remote', fullName: string} } = {};
        
        const [localOutput, remoteOutput] = await Promise.all([
            this.executeGitCommand(workspacePath, ['branch']),
            this.executeGitCommand(workspacePath, ['branch', '-r'])
        ]);

        localOutput.split('\n').filter(Boolean).forEach(line => {
            const branchName = line.replace('*', '').trim();
            branches[branchName] = { type: 'local', fullName: branchName };
        });

        remoteOutput.split('\n').filter(Boolean).forEach(line => {
            const fullName = line.trim();
            if (fullName.includes('HEAD ->')) { return; }
            
            const parts = fullName.split('/');
            if (parts.length >= 2) {
                const branchName = parts.slice(1).join('/');
                branches[`${branchName} (${parts[0]})`] = { type: 'remote', fullName };
            }
        });
        
        return branches;
    }

    private generateDateRange(startDate: Date, endDate: Date): string[] {
        const dates: string[] = [];
        const current = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        
        while (current <= endDate) {
            dates.push(format(current, 'yyyy-MM-dd'));
            current.setDate(current.getDate() + 1);
        }
        
        return dates;
    }

    public async getGitStats(
        workspacePath: string, 
        startDate: string | null,
        endDate: string | null,
        branchName: string | null
    ): Promise<GitStats> {
        branchName = branchName || await this.getCurrentBranch(workspacePath);
        
        const dateRange = startDate && endDate 
            ? `--after=${startDate} --before=${endDate}`
            : null;
            
        const dateList = startDate && endDate 
            ? this.generateDateRange(new Date(startDate), new Date(endDate))
            : null;

        const output = await this.executeGitCommand(workspacePath, [
            'log',
            branchName,
            ...(dateRange ? dateRange.split(' ') : []),
            '--pretty=format:--SPLIT--%n%ad%n%an <%ae>',
            '--date=short',
            '--numstat'
        ]);

        const addedLines: { [email: string]: number } = {};
        const removedLines: { [email: string]: number } = {};
        const netLines: { [email: string]: number } = {};
        const authorNames: { [email: string]: string } = {};
        const commitsByDate: { [date: string]: { [email: string]: number } } = {};

        output.split('--SPLIT--').forEach(commit => {
            const lines = commit.trim().split('\n');
            if (lines.length < 2) { return; }

            const date = lines[0].trim();
            const authorMatch = lines[1].trim().match(/(.*) <(.*)>/);
            if (!authorMatch) { return; }

            const [, name, email] = authorMatch;
            authorNames[email] = name;

            commitsByDate[date] = commitsByDate[date] || {};
            commitsByDate[date][email] = (commitsByDate[date][email] || 0) + 1;

            lines.slice(2).forEach(line => {
                const parts = line.trim().split('\t');
                if (parts.length === 3) {
                    const added = parts[0] !== '-' ? parseInt(parts[0], 10) : 0;
                    const removed = parts[1] !== '-' ? parseInt(parts[1], 10) : 0;

                    addedLines[email] = (addedLines[email] || 0) + added;
                    removedLines[email] = (removedLines[email] || 0) + removed;
                    netLines[email] = (netLines[email] || 0) + (added - removed);
                }
            });
        });

        const branches = await this.getBranches(workspacePath);
        const finalDateList = dateList || Object.keys(commitsByDate).sort();
        
        return {
            workspacePath,
            branches,
            authorNames,
            addedLines,
            removedLines,
            netLines,
            commitsByDate,
            dateList: finalDateList,
            startDate: startDate || finalDateList[0],
            endDate: endDate || finalDateList[finalDateList.length - 1],
            branch: branchName
        };
    }
}