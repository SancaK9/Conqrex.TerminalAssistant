import * as vscode from 'vscode';

export interface CommandParameter {
    name: string;
    description?: string;
    defaultValue?: string;
}

export interface CommandDefinition {
    label: string;
    command: string;
    description?: string;
    autoExecute: boolean; // Whether to execute automatically or wait for user to press Enter
    group: string; // Group for organizing commands
    parameters?: CommandParameter[]; // Optional parameters for the command
}

export class CommandTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly commandDefinition?: CommandDefinition
    ) {
        super(label, collapsibleState);

        if (commandDefinition) {
            this.tooltip = commandDefinition.description || commandDefinition.command;
            this.description = commandDefinition.description || commandDefinition.command;

            // Add parameter count to description if any
            if (commandDefinition.parameters && commandDefinition.parameters.length > 0) {
                this.description += ` (${commandDefinition.parameters.length} params)`;
            }

            // Set context value for command items
            this.contextValue = 'terminalCommand';
        } else {
            // This is a group item
            this.contextValue = 'commandGroup';
        }
    }

    // Custom icons for different item types
    iconPath = this.commandDefinition
        ? new vscode.ThemeIcon('terminal-view-icon')
        : new vscode.ThemeIcon('folder');
}

export class CommandsTreeProvider implements vscode.TreeDataProvider<CommandTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommandTreeItem | undefined | null | void> = new vscode.EventEmitter<CommandTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommandTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    // Add this property to store search term
    private searchTerm: string = '';

    constructor(
        private getCommands: () => Promise<CommandDefinition[]>
    ) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // Add this method to handle search
    setSearchTerm(term: string): void {
        this.searchTerm = term.toLowerCase();
        this.refresh();
    }

    getTreeItem(element: CommandTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CommandTreeItem): Promise<CommandTreeItem[]> {
        if (!element) {
            // Root level - show groups
            const commands = await this.getCommands();
            
            // Filter commands by search term if one exists
            const filteredCommands = this.searchTerm 
                ? commands.filter(cmd => 
                    cmd.label.toLowerCase().includes(this.searchTerm) || 
                    (cmd.description && cmd.description.toLowerCase().includes(this.searchTerm)) ||
                    cmd.command.toLowerCase().includes(this.searchTerm)
                )
                : commands;

            if (filteredCommands.length === 0) {
                return [new CommandTreeItem('No commands found', vscode.TreeItemCollapsibleState.None)];
            }

            // Get unique groups and sort them
            const groups = [...new Set(filteredCommands.map(cmd => cmd.group))].sort();

            return groups.map(group => {
                const groupCommands = filteredCommands.filter(cmd => cmd.group === group);
                return new CommandTreeItem(
                    `${group} (${groupCommands.length})`,
                    vscode.TreeItemCollapsibleState.Expanded
                );
            });
        } else {
            // Group level - show commands in this group
            const commands = await this.getCommands();
            const groupName = element.label.replace(/ \(\d+\)$/, '');
            
            // Filter commands by search term and group
            let commandsInGroup = commands.filter(cmd => cmd.group === groupName);
            
            if (this.searchTerm) {
                commandsInGroup = commandsInGroup.filter(cmd => 
                    cmd.label.toLowerCase().includes(this.searchTerm) || 
                    (cmd.description && cmd.description.toLowerCase().includes(this.searchTerm)) ||
                    cmd.command.toLowerCase().includes(this.searchTerm)
                );
            }

            return commandsInGroup.map(cmd => {
                return new CommandTreeItem(
                    cmd.label,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'terminalAssistant.runCommandFromTree',
                        title: 'Run Command',
                        arguments: [cmd]
                    },
                    cmd
                );
            });
        }
    }
}