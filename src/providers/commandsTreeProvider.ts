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
    autoExecute: boolean;
    clearTerminal?: boolean; // Clear terminal before executing
    escapeKeyBefore?: boolean; // Send escape key before executing
    group: string; // Now supports path format like "Development/Backend/Database"
    parameters?: CommandParameter[];
}

// New interface to represent group hierarchy
export interface GroupNode {
    name: string;
    path: string; // Full path like "Development/Backend"
    commands: CommandDefinition[];
    subgroups: GroupNode[];
}

export class CommandTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly commandDefinition?: CommandDefinition,
        public readonly groupPath?: string // Add path for group items
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
    
    private searchTerm: string = '';
    private groupHierarchy: GroupNode[] = [];

    constructor(
        private getCommands: () => Promise<CommandDefinition[]>
    ) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setSearchTerm(term: string): void {
        this.searchTerm = term.toLowerCase();
        this.refresh();
    }

    getTreeItem(element: CommandTreeItem): vscode.TreeItem {
        return element;
    }

    // Build group hierarchy from flat list of commands
    private buildGroupHierarchy(commands: CommandDefinition[]): GroupNode[] {
        const rootGroups: GroupNode[] = [];
        const allGroups = new Map<string, GroupNode>();

        // First pass - create all group nodes
        commands.forEach(cmd => {
            const groupPath = cmd.group;
            const groupSegments = groupPath.split('/');
            
            let currentPath = '';
            let currentParent: GroupNode | null = null;
            
            // Create or find each level of the path
            for (let i = 0; i < groupSegments.length; i++) {
                const segment = groupSegments[i];
                const isLastSegment = i === groupSegments.length - 1;
                
                // Build the current path segment by segment
                currentPath = currentPath ? `${currentPath}/${segment}` : segment;
                
                // If we don't have this path yet, create the group
                if (!allGroups.has(currentPath)) {
                    const newGroup: GroupNode = {
                        name: segment,
                        path: currentPath,
                        commands: [],
                        subgroups: []
                    };
                    
                    allGroups.set(currentPath, newGroup);
                    
                    // If this is a top-level group, add to rootGroups
                    if (!currentParent) {
                        rootGroups.push(newGroup);
                    } else {
                        currentParent.subgroups.push(newGroup);
                    }
                }
                
                // Set current parent to this group for the next iteration
                currentParent = allGroups.get(currentPath)!;
                
                // If this is the last segment, add the command to this group
                if (isLastSegment) {
                    currentParent.commands.push(cmd);
                }
            }
        });
        
        return rootGroups;
    }

    async getChildren(element?: CommandTreeItem): Promise<CommandTreeItem[]> {
        const commands = await this.getCommands();
        
        // Filter commands by search term if one exists
        const filteredCommands = this.searchTerm 
            ? commands.filter(cmd => 
                cmd.label.toLowerCase().includes(this.searchTerm) || 
                (cmd.description && cmd.description.toLowerCase().includes(this.searchTerm)) ||
                cmd.command.toLowerCase().includes(this.searchTerm) ||
                cmd.group.toLowerCase().includes(this.searchTerm)
            )
            : commands;

        if (filteredCommands.length === 0) {
            return [new CommandTreeItem('No commands found', vscode.TreeItemCollapsibleState.None)];
        }

        // If we're doing a search, flatten the hierarchy for better search results
        if (this.searchTerm) {
            return filteredCommands.map(cmd => {
                return new CommandTreeItem(
                    `${cmd.label} (${cmd.group})`,
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

        // Root level - build and show the group hierarchy
        if (!element) {
            this.groupHierarchy = this.buildGroupHierarchy(filteredCommands);
            
            return this.groupHierarchy.map(group => {
                const commandCount = this.countCommandsInGroup(group);
                return new CommandTreeItem(
                    `${group.name} (${commandCount})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    group.path
                );
            });
        } 
        // Group level - show subgroups and commands
        else if (element.groupPath) {
            // Find the group in the hierarchy
            const findGroup = (groups: GroupNode[], path: string): GroupNode | null => {
                for (const group of groups) {
                    if (group.path === path) {
                        return group;
                    }
                    const found = findGroup(group.subgroups, path);
                    if (found) {
                        return found;
                    }
                }
                return null;
            };
            
            const group = findGroup(this.groupHierarchy, element.groupPath);
            if (!group) {
                return [];
            }
            
            // Create items for subgroups first
            const items: CommandTreeItem[] = group.subgroups.map(subgroup => {
                const commandCount = this.countCommandsInGroup(subgroup);
                return new CommandTreeItem(
                    `${subgroup.name} (${commandCount})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    subgroup.path
                );
            });
            
            // Then add items for commands in this group
            items.push(...group.commands.map(cmd => {
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
            }));
            
            return items;
        }
        
        return [];
    }
    
    // Helper function to count all commands in a group and its subgroups
    private countCommandsInGroup(group: GroupNode): number {
        let count = group.commands.length;
        for (const subgroup of group.subgroups) {
            count += this.countCommandsInGroup(subgroup);
        }
        return count;
    }
}