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
    branches: string[];
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
     * Executa um comando Git no workspace especificado
     */
    private executeGitCommand(workspacePath: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            child_process.exec(
                `git ${args.join(' ')}`, 
                { cwd: workspacePath, maxBuffer: 10 * 1024 * 1024 },
                (error, stdout, stderr) => {
                    if (error && error.code !== 0) {
                        reject(new Error(`Git error: ${stderr.toString()}`));
                        return;
                    }
                    resolve(stdout.toString());
                }
            );
        });
    }

    /**
     * Obtém o branch atual
     */
    public async getCurrentBranch(workspacePath: string): Promise<string> {
        try {
            const output = await this.executeGitCommand(workspacePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
            return output.trim();
        } catch (error) {
            console.error('Erro ao obter branch atual:', error);
            throw error;
        }
    }

    /**
     * Verifica se um branch existe
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
     * Obtém todos os branches disponíveis
     */
    public async getBranches(workspacePath: string): Promise<string[]> {
        try {
            const output = await this.executeGitCommand(workspacePath, ['branch']);
            return output
                .split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => line.replace('*', '').trim());
        } catch (error) {
            console.error('Erro ao obter branches:', error);
            return [];
        }
    }

    /**
     * Gera uma sequência de datas entre duas datas
     */
    private generateDateRange(startDate: Date, endDate: Date): string[] {
        const dates: string[] = [];
        const current = new Date(startDate);
        
        // Incluir o dia final completo
        endDate.setHours(23, 59, 59, 999);
        
        while (current <= endDate) {
            dates.push(format(current, 'yyyy-MM-dd'));
            current.setDate(current.getDate() + 1);
        }
        
        return dates;
    }

    /**
     * Gera cores distintas para os gráficos
     */
    public generateDistinctColors(n: number): string[] {
        const colors: string[] = [];
        for (let i = 0; i < n; i++) {
            const color = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
            if (!colors.includes(color)) {
                colors.push(color);
            } else {
                i--; // tentar novamente
            }
        }
        return colors;
    }

    /**
     * Executa git log com os parâmetros especificados
     */
    private async runGitLog(workspacePath: string, dateRange: string | null, branch: string): Promise<string> {
        let command = ['log', branch];
        
        if (dateRange) {
            command = [...command, ...dateRange.split(' ')];
        }
        
        command.push('--pretty=format:--SPLIT--%n%ad%n%an <%ae>');
        command.push('--date=short');
        command.push('--numstat');
        
        return this.executeGitCommand(workspacePath, command);
    }

    /**
     * Gera estatísticas Git para as datas e branch especificados
     */
    public async getGitStats(
        workspacePath: string, 
        startDateArg: string | null,
        endDateArg: string | null,
        branchName: string | null
    ): Promise<GitStats> {
        // Se não for especificado branch, usar o atual
        if (!branchName) {
            branchName = await this.getCurrentBranch(workspacePath);
        }

        // Verificar se o branch existe
        const branchExists = await this.branchExists(workspacePath, branchName);
        if (!branchExists) {
            throw new Error(`Branch '${branchName}' não existe.`);
        }

        // Configurar intervalo de datas
        let dateRange: string | null = null;
        let dateList: string[] | null = null;
        let startDate: string = "Beginning";
        let endDate: string = "Now";

        if (startDateArg && startDateArg !== "all" && 
            endDateArg && endDateArg !== "all") {
            dateRange = `--after=${startDateArg} --before=${endDateArg}`;
            const startDt = new Date(startDateArg);
            const endDt = new Date(endDateArg);
            dateList = this.generateDateRange(startDt, endDt);
            startDate = startDateArg;
            endDate = endDateArg;
        }

        // Executar git log
        const output = await this.runGitLog(workspacePath, dateRange, branchName);

        // Processar resultados
        const addedLines: { [email: string]: number } = {};
        const removedLines: { [email: string]: number } = {};
        const netLines: { [email: string]: number } = {};
        const authorNames: { [email: string]: string } = {};
        const commitsByDate: { [date: string]: { [email: string]: number } } = {};

        // Dividir saída por commits
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

            // Inicializar se necessário
            if (!commitsByDate[date]) {
                commitsByDate[date] = {};
            }
            
            // Incrementar contador de commits
            commitsByDate[date][email] = (commitsByDate[date][email] || 0) + 1;

            // Processar estatísticas de linhas
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
                        // Ignorar linhas com formato inválido
                    }
                }
            }
        }

        // Se não foi especificado datas, usar as datas dos commits
        if (dateList === null) {
            dateList = Object.keys(commitsByDate).sort();
            if (dateList.length > 0) {
                startDate = dateList[0];
                endDate = dateList[dateList.length - 1];
            }
        }

        // Obter todos os branches
        const branches = await this.getBranches(workspacePath);

        return {
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