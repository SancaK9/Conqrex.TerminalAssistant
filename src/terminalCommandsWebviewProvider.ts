import * as vscode from 'vscode';
import { CommandDefinition } from './commandsTreeProvider';

export class TerminalCommandsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalCommandsWebview';
    private _view?: vscode.WebviewView;
    private _commands: CommandDefinition[] = [];
    private _isViewVisible: boolean = false;

    // Add a state tracking variable
    private _viewState: {
        isLoaded: boolean;
        searchTerm?: string;
    } = { isLoaded: false };

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _loadCommands: () => Promise<CommandDefinition[]>,
        private readonly _executeCommand: (command: CommandDefinition) => Promise<void>
    ) { }

    public async refresh(): Promise<void> {
        this._commands = await this._loadCommands();
        if (this._view && this._view.visible) {
            this._view.webview.postMessage({
                type: 'refreshCommands',
                commands: this._commands
            });
        }
    }

    // Add method to save search state
    public saveSearchState(searchTerm: string): void {
        this._viewState.searchTerm = searchTerm;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Store visibility state
        this._isViewVisible = true;
        
        // Add visibility change listener
        webviewView.onDidChangeVisibility(() => {
            this._isViewVisible = webviewView.visible;
            if (webviewView.visible) {
                // Refresh commands when the view becomes visible again
                this.refresh();
                
                // If there was a search term, restore it
                if (this._viewState.searchTerm) {
                    webviewView.webview.postMessage({
                        type: 'restoreSearch',
                        searchTerm: this._viewState.searchTerm
                    });
                }
            }
        });

        // Load commands when view is shown
        this.refresh();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'executeCommand':
                    await this._executeCommand(data.command);
                    break;

                case 'search':
                    const searchTerm = data.searchTerm.toLowerCase();
                    const filtered = this._commands.filter(cmd =>
                        cmd.label.toLowerCase().includes(searchTerm) ||
                        (cmd.description && cmd.description.toLowerCase().includes(searchTerm)) ||
                        cmd.command.toLowerCase().includes(searchTerm) ||
                        cmd.group.toLowerCase().includes(searchTerm) // Add group to search
                    );

                    webviewView.webview.postMessage({
                        type: 'searchResults',
                        commands: filtered
                    });
                    break;

                case 'editCommand':
                    vscode.commands.executeCommand('terminalAssistant.editCommandFromTree', {
                        commandDefinition: data.command
                    });
                    break;

                case 'removeCommand':
                    vscode.commands.executeCommand('terminalAssistant.removeCommandFromTree', {
                        commandDefinition: data.command
                    });
                    break;

                case 'addCommand':
                    vscode.commands.executeCommand('terminalAssistant.addCommandFromTree');
                    break;
            }
        });

        // Mark as loaded
        this._viewState.isLoaded = true;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the local path to style resources
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
        );

        // Get path to the Codicons in VS Code
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${codiconsUri}" rel="stylesheet" />
                <link rel="stylesheet" href="${styleUri}">
                <title>Terminal Commands</title>
                <style>
                    body {
                        padding: 0;
                        margin: 0;
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                    }
                    
                    .search-container {
                        padding: 8px;
                        position: sticky;
                        top: 0;
                        background: var(--vscode-sideBar-background);
                        z-index: 10;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    
                    .search-input-container {
                        display: flex;
                        align-items: center;
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        overflow: hidden;
                    }
                    
                    .search-input {
                        flex: 1;
                        border: none;
                        background: transparent;
                        color: var(--vscode-input-foreground);
                        padding: 6px 8px;
                        font-size: 13px;
                    }
                    
                    .search-input:focus {
                        outline: none;
                    }
                    
                    .clear-button {
                        background: transparent;
                        border: none;
                        color: var(--vscode-icon-foreground);
                        padding: 0 8px;
                        cursor: pointer;
                        opacity: 0.8;
                        display: none;
                    }
                    
                    .clear-button:hover {
                        opacity: 1;
                    }
                    
                    .group-header {
                        padding: 8px 12px;
                        background-color: var(--vscode-sideBarSectionHeader-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        font-weight: bold;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    }
                    
                    .group-header:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .group-icon {
                        margin-right: 6px;
                    }
                    
                    .group-counter {
                        font-size: 10px;
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 0 6px;
                        border-radius: 10px;
                        margin-left: 6px;
                    }
                    
                    .command-list {
                        overflow: hidden;
                    }
                    
                    .command-item {
                        display: flex;
                        padding: 6px 12px 6px 24px;
                        cursor: pointer;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        align-items: center;
                        position: relative; /* Add position relative for pseudo-element */
                        justify-content: space-between;
                    }
                    
                    .command-item::before {
                        content: "";
                        position: absolute;
                        left: 12px; /* Adjust based on your padding */
                        top: 50%;
                        width: 6px;
                        height: 6px;
                        border-radius: 50%;
                        transform: translateY(-50%);
                    }
                    
                    .command-item:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    
                    .command-icon {
                        margin-right: 6px;
                        color: var(--vscode-icon-foreground);
                    }
                    
                    .command-content {
                        flex: 1;
                        overflow: hidden;
                        min-width: 0; /* Allows text truncation to work properly */
                        margin-right: 8px;
                    }
                    
                    .command-label {
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    
                    .command-description {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    
                    .command-actions {
                        display: flex !important;
                        align-items: center;
                        visibility: visible !important;
                        opacity: 1 !important;
                        gap: 4px;
                        min-width: 90px; /* Ensure buttons have enough space */
                    }
                    
                    .toolbar {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px;
                        background-color: var(--vscode-sideBar-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    
                    .no-commands {
                        padding: 16px;
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
                    }
                    
                    .add-button {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-weight: 500;
                        margin: 16px auto;
                    }
                    
                    .add-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .codicon {
                        font-family: codicon;
                        font-size: 16px;
                        font-style: normal;
                        display: inline-block;
                        vertical-align: text-bottom;
                        line-height: 1;
                    }
                    
                    .icon-margin {
                        margin-right: 5px; 
                    }

                    .primary-button {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        padding: 4px 8px;
                        border-radius: 3px;
                        border: none;
                        cursor: pointer;
                        font-weight: 500;
                    }

                    .primary-button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    .action-button {
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        padding: 4px;
                        color: var(--vscode-icon-foreground);
                        border-radius: 3px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .action-button:hover {
                        background-color: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
                    }
                    
                    .run-btn {
                        color: var(--vscode-terminal-ansiGreen, #89d185);
                    }
                    
                    .edit-btn {
                        color: var(--vscode-terminal-ansiBlue, #2472c8);
                    }
                    
                    .remove-btn {
                        color: var(--vscode-terminal-ansiRed, #f14c4c);
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <div>Terminal Commands</div>
                    <button class="action-button primary-button" id="addCommandBtn" title="Add Command">
                        <i class="codicon codicon-add"></i> Add Command
                    </button>
                </div>
                
                <div class="search-container">
                    <div class="search-input-container">
                        <input type="text" class="search-input" id="searchInput" placeholder="Search commands...">
                        <button id="clearSearchBtn" class="clear-button">✕</button>
                    </div>
                </div>
                
                <div id="commandsContainer"></div>
                
                <script>
                    const vscode = acquireVsCodeApi();
                    let allCommands = [];
                    let expandedGroups = new Set();
                    
                    // Initialize search elements
                    const searchInput = document.getElementById('searchInput');
                    const clearSearchBtn = document.getElementById('clearSearchBtn');
                    
                    // Handle search input
                    searchInput.addEventListener('input', () => {
                        const searchTerm = searchInput.value;
                        clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
                        
                        if (searchTerm) {
                            vscode.postMessage({ type: 'search', searchTerm });
                        } else {
                            renderCommands(allCommands);
                        }
                    });
                    
                    // Clear search
                    clearSearchBtn.addEventListener('click', () => {
                        searchInput.value = '';
                        clearSearchBtn.style.display = 'none';
                        renderCommands(allCommands);
                        searchInput.focus();
                    });
                    
                    // Add command button
                    document.getElementById('addCommandBtn').addEventListener('click', () => {
                        vscode.postMessage({ type: 'addCommand' });
                    });
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'refreshCommands':
                                allCommands = message.commands;
                                renderCommands(allCommands);
                                break;
                                
                            case 'searchResults':
                                renderCommands(message.commands, true);
                                break;
                                
                            case 'focusSearch':
                                // Focus on the search box
                                setTimeout(() => {
                                    document.getElementById('searchInput').focus();
                                }, 100);
                                break;
                        }
                    });
                    
                    // Build nested group structure from flat command list
                    function buildGroupHierarchy(commands) {
                        const groups = {};
                        
                        // First, create all group paths and associate commands
                        commands.forEach(cmd => {
                            const groupPath = cmd.group;
                            const segments = groupPath.split('/');
                            
                            // Ensure all parent paths exist
                            let currentPath = '';
                            for (let i = 0; i < segments.length; i++) {
                                const segment = segments[i];
                                currentPath = currentPath ? \`\${currentPath}/\${segment}\` : segment;
                                
                                if (!groups[currentPath]) {
                                    groups[currentPath] = {
                                        name: segment,
                                        path: currentPath,
                                        commands: [],
                                        subgroups: [],
                                        parent: i > 0 ? segments.slice(0, i).join('/') : null
                                    };
                                }
                            }
                            
                            // Add command to its group
                            groups[groupPath].commands.push(cmd);
                        });
                        
                        // Now build the hierarchy by adding each group to its parent's subgroups
                        Object.values(groups).forEach(group => {
                            if (group.parent) {
                                groups[group.parent].subgroups.push(group);
                            }
                        });
                        
                        // Return only root groups (those without parents)
                        return Object.values(groups).filter(group => !group.parent);
                    }
                    
                    // Count all commands in a group and its subgroups
                    function countCommands(group) {
                        let count = group.commands.length;
                        group.subgroups.forEach(subgroup => {
                            count += countCommands(subgroup);
                        });
                        return count;
                    }
                    
                    // Render commands grouped by their group property
                    function renderCommands(commands, isSearchResult = false) {
                        const container = document.getElementById('commandsContainer');
                        container.innerHTML = '';
                        
                        if (commands.length === 0) {
                            container.innerHTML = \`
                                <div class="no-commands">
                                    No commands found.
                                    <button class="add-button" id="addCommandBtnEmpty">
                                        Add Command
                                    </button>
                                </div>
                            \`;
                            
                            document.getElementById('addCommandBtnEmpty').addEventListener('click', () => {
                                vscode.postMessage({ type: 'addCommand' });
                            });
                            
                            return;
                        }
                        
                        // If search is active, flatten the hierarchy
                        if (searchInput.value.trim()) {
                            // Create a flat list of commands with their full paths for better context in search results
                            const flatCommandList = commands.map(cmd => {
                                return {
                                    ...cmd,
                                    fullLabel: \`\${cmd.label} (\${cmd.group})\`
                                };
                            });
                            
                            // Filter commands based on search term
                            const searchTerm = searchInput.value.toLowerCase();
                            const searchResults = flatCommandList.filter(cmd =>
                                cmd.label.toLowerCase().includes(searchTerm) ||
                                (cmd.description && cmd.description.toLowerCase().includes(searchTerm)) ||
                                cmd.command.toLowerCase().includes(searchTerm) ||
                                cmd.group.toLowerCase().includes(searchTerm)
                            );
                            
                            // Render search results in a flat list (no hierarchy)
                            container.innerHTML = ''; // Clear container
                            
                            if (searchResults.length === 0) {
                                container.innerHTML = \`
                                    <div class="no-commands">
                                        No commands match your search.
                                        <button class="add-button" id="addCommandBtnEmpty">
                                            Add Command
                                        </button>
                                    </div>
                                \`;
                                
                                document.getElementById('addCommandBtnEmpty').addEventListener('click', () => {
                                    vscode.postMessage({ type: 'addCommand' });
                                });
                                
                                return;
                            }
                            
                            // Create a simple list for search results
                            const searchResultsList = document.createElement('div');
                            searchResultsList.className = 'search-results';
                            
                            searchResults.forEach(cmd => {
                                const commandItem = document.createElement('div');
                                commandItem.className = 'command-item';
                                
                                // Highlight parameters in command display
                                let commandText = cmd.command;
                                if (cmd.parameters && cmd.parameters.length > 0) {
                                    cmd.parameters.forEach(param => {
                                        const paramRegex = new RegExp('\\{' + param.name + '\\}', 'g');
                                        commandText = commandText.replace(
                                            paramRegex,
                                            '<span class="command-parameter">{' + param.name + '}</span>'
                                        );
                                    });
                                }
                                
                                commandItem.innerHTML = \`
                                    <div class="command-icon">
                                        <i class="codicon codicon-terminal icon-margin"></i>
                                    </div>
                                    <div class="command-content">
                                        <div class="command-label">\${cmd.label} <span style="opacity:0.7">(\${cmd.group})</span></div>
                                        <div class="command-description">\${cmd.description || commandText}</div>
                                    </div>
                                    <div class="command-actions">
                                        <button class="action-button run-btn" title="Run Command">
                                            <i class="codicon codicon-play"></i>
                                        </button>
                                        <button class="action-button edit-btn" title="Edit Command">
                                            <i class="codicon codicon-edit"></i>
                                        </button>
                                        <button class="action-button remove-btn" title="Delete Command">
                                            <i class="codicon codicon-trash"></i>
                                        </button>
                                    </div>
                                \`;
                                
                                // Add event listeners for the command item
                                commandItem.querySelector('.run-btn').addEventListener('click', (event) => {
                                    event.stopPropagation();
                                    vscode.postMessage({
                                        type: 'executeCommand',
                                        command: cmd
                                    });
                                });
                                
                                commandItem.querySelector('.edit-btn').addEventListener('click', (event) => {
                                    event.stopPropagation();
                                    vscode.postMessage({
                                        type: 'editCommand',
                                        command: cmd
                                    });
                                });
                                
                                commandItem.querySelector('.remove-btn').addEventListener('click', (event) => {
                                    event.stopPropagation();
                                    vscode.postMessage({
                                        type: 'removeCommand',
                                        command: cmd
                                    });
                                });
                                
                                commandItem.addEventListener('click', () => {
                                    vscode.postMessage({
                                        type: 'executeCommand',
                                        command: cmd
                                    });
                                });
                                
                                searchResultsList.appendChild(commandItem);
                            });
                            
                            container.appendChild(searchResultsList);
                            return;
                        }
                        
                        // Build group hierarchy
                        const rootGroups = buildGroupHierarchy(commands);
                        
                        // Sort groups alphabetically
                        const sortGroups = (groups) => {
                            return groups.sort((a, b) => a.name.localeCompare(b.name));
                        };
                        
                        // Recursive function to render a group and its subgroups
                        const renderGroup = (group, level = 0) => {
                            const groupDiv = document.createElement('div');
                            groupDiv.className = 'group-container';
                            groupDiv.dataset.path = group.path;
                            
                            // Create group header with indent based on level
                            const isExpanded = isSearchResult || expandedGroups.has(group.path);
                            const commandCount = countCommands(group);
                            
                            const groupHeader = document.createElement('div');
                            groupHeader.className = 'group-header';
                            groupHeader.style.paddingLeft = \`\${12 + level * 16}px\`; // Indent based on level
                            
                            groupHeader.innerHTML = \`
                                <div>
                                    <span class="group-icon">\${isExpanded ? '▼' : '▶'}</span>
                                    \${group.name}
                                    <span class="group-counter">\${commandCount}</span>
                                </div>
                            \`;
                            
                            // Toggle group expansion
                            groupHeader.addEventListener('click', () => {
                                const content = groupDiv.querySelector('.group-content');
                                const isCurrentlyExpanded = content.style.display !== 'none';
                                
                                if (isCurrentlyExpanded) {
                                    content.style.display = 'none';
                                    groupHeader.querySelector('.group-icon').textContent = '▶';
                                    expandedGroups.delete(group.path);
                                } else {
                                    content.style.display = 'block';
                                    groupHeader.querySelector('.group-icon').textContent = '▼';
                                    expandedGroups.add(group.path);
                                }
                            });
                            
                            // Create content container for subgroups and commands
                            const groupContent = document.createElement('div');
                            groupContent.className = 'group-content';
                            groupContent.style.display = isExpanded ? 'block' : 'none';
                            
                            // Add subgroups first
                            if (group.subgroups && group.subgroups.length > 0) {
                                sortGroups(group.subgroups).forEach(subgroup => {
                                    groupContent.appendChild(renderGroup(subgroup, level + 1));
                                });
                            }
                            
                            // Then add commands
                            if (group.commands && group.commands.length > 0) {
                                const commandList = document.createElement('div');
                                commandList.className = 'command-list';
                                
                                group.commands.forEach(cmd => {
                                    const commandItem = document.createElement('div');
                                    commandItem.className = 'command-item';
                                    // Apply indentation to command items based on their nesting level
                                    commandItem.style.paddingLeft = \`\${24 + level * 16}px\`; // Indent commands to match their group level
                                    
                                    // Highlight parameters in command display
                                    let commandText = cmd.command;
                                    if (cmd.parameters && cmd.parameters.length > 0) {
                                        cmd.parameters.forEach(param => {
                                            const paramRegex = new RegExp('\\\\{' + param.name + '\\\\}', 'g');
                                            commandText = commandText.replace(
                                                paramRegex,
                                                '<span class="command-parameter">{' + param.name + '}</span>'
                                            );
                                        });
                                    }
                                    
                                    commandItem.innerHTML = \`
                                        <div class="command-icon">
                                            <i class="codicon codicon-terminal icon-margin"></i>
                                        </div>
                                        <div class="command-content">
                                            <div class="command-label">\${cmd.label}</div>
                                            <div class="command-description">\${cmd.description || commandText}</div>
                                        </div>
                                        <div class="command-actions">
                                            <button class="action-button run-btn" title="Run Command">
                                                <i class="codicon codicon-play"></i>
                                            </button>
                                            <button class="action-button edit-btn" title="Edit Command">
                                                <i class="codicon codicon-edit"></i>
                                            </button>
                                            <button class="action-button remove-btn" title="Delete Command">
                                                <i class="codicon codicon-trash"></i>
                                            </button>
                                        </div>
                                    \`;
                                    
                                    // Execute command
                                    commandItem.querySelector('.run-btn').addEventListener('click', (event) => {
                                        event.stopPropagation();
                                        vscode.postMessage({
                                            type: 'executeCommand',
                                            command: cmd
                                        });
                                    });
                                    
                                    // Edit command
                                    commandItem.querySelector('.edit-btn').addEventListener('click', (event) => {
                                        event.stopPropagation();
                                        vscode.postMessage({
                                            type: 'editCommand',
                                            command: cmd
                                        });
                                    });
                                    
                                    // Remove command
                                    commandItem.querySelector('.remove-btn').addEventListener('click', (event) => {
                                        event.stopPropagation();
                                        vscode.postMessage({
                                            type: 'removeCommand',
                                            command: cmd
                                        });
                                    });
                                    
                                    // Add click event to run command when clicking on the item
                                    commandItem.addEventListener('click', () => {
                                        vscode.postMessage({
                                            type: 'executeCommand',
                                            command: cmd
                                        });
                                    });
                                    
                                    commandList.appendChild(commandItem);
                                });
                                
                                groupContent.appendChild(commandList);
                            }
                            
                            groupDiv.appendChild(groupHeader);
                            groupDiv.appendChild(groupContent);
                            return groupDiv;
                        };
                        
                        // Render all root groups
                        sortGroups(rootGroups).forEach(group => {
                            container.appendChild(renderGroup(group));
                        });
                    }
                </script>
            </body>
            </html>`;
    }
}