import * as vscode from 'vscode';
import { CommandDefinition } from './commandsTreeProvider';

export class TerminalCommandsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalCommandsWebview';
    private _view?: vscode.WebviewView;
    private _commands: CommandDefinition[] = [];
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _loadCommands: () => Promise<CommandDefinition[]>,
        private readonly _executeCommand: (command: CommandDefinition) => Promise<void>
    ) {}
    
    public async refresh(): Promise<void> {
        this._commands = await this._loadCommands();
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'refreshCommands', 
                commands: this._commands 
            });
        }
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
                        cmd.command.toLowerCase().includes(searchTerm)
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
                        display: none;
                        align-items: center;
                    }
                    
                    .command-item:hover .command-actions {
                        display: flex;
                    }
                    
                    .action-button {
                        background: transparent;
                        border: none;
                        color: var(--vscode-icon-foreground);
                        cursor: pointer;
                        padding: 2px;
                        opacity: 0.8;
                        margin-left: 4px;
                    }
                    
                    .action-button:hover {
                        opacity: 1;
                        background-color: var(--vscode-button-secondaryHoverBackground);
                        border-radius: 3px;
                    }
                    
                    .command-parameter {
                        background-color: var(--vscode-editor-selectionBackground);
                        color: var(--vscode-editor-selectionForeground);
                        padding: 0 4px;
                        border-radius: 3px;
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
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <div>Terminal Commands</div>
                    <button class="action-button" id="addCommandBtn" title="Add Command">
                        <i class="codicon codicon-add"></i>
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
                        
                        // Group commands by their group property
                        const groupedCommands = {};
                        commands.forEach(cmd => {
                            if (!groupedCommands[cmd.group]) {
                                groupedCommands[cmd.group] = [];
                            }
                            groupedCommands[cmd.group].push(cmd);
                        });
                        
                        // Sort groups alphabetically
                        const sortedGroups = Object.keys(groupedCommands).sort();
                        
                        // Create group elements
                        sortedGroups.forEach(groupName => {
                            const cmds = groupedCommands[groupName];
                            
                            // Create group header
                            const groupDiv = document.createElement('div');
                            
                            // If it's search results, expand all groups
                            const isExpanded = isSearchResult || expandedGroups.has(groupName);
                            
                            const groupHeader = document.createElement('div');
                            groupHeader.className = 'group-header';
                            groupHeader.innerHTML = \`
                                <div>
                                    <span class="group-icon">\${isExpanded ? '▼' : '▶'}</span>
                                    \${groupName}
                                    <span class="group-counter">\${cmds.length}</span>
                                </div>
                            \`;
                            
                            // Toggle group expansion
                            groupHeader.addEventListener('click', () => {
                                const isCurrentlyExpanded = commandList.style.display !== 'none';
                                
                                if (isCurrentlyExpanded) {
                                    commandList.style.display = 'none';
                                    groupHeader.querySelector('.group-icon').textContent = '▶';
                                    expandedGroups.delete(groupName);
                                } else {
                                    commandList.style.display = 'block';
                                    groupHeader.querySelector('.group-icon').textContent = '▼';
                                    expandedGroups.add(groupName);
                                }
                            });
                            
                            // Create command list
                            const commandList = document.createElement('div');
                            commandList.className = 'command-list';
                            commandList.style.display = isExpanded ? 'block' : 'none';
                            
                            // Add commands to the list
                            cmds.forEach(cmd => {
                                const commandItem = document.createElement('div');
                                commandItem.className = 'command-item';
                                
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
                            
                            groupDiv.appendChild(groupHeader);
                            groupDiv.appendChild(commandList);
                            container.appendChild(groupDiv);
                        });
                    }
                </script>
            </body>
            </html>`;
    }
}