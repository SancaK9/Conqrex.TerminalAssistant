import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

/**
 * WebView provider for the minimized commands panel that appears in the bottom bar
 */
export class MinimizedCommandsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalAssistant.minimizedCommandsView';
    
    private _view?: vscode.WebviewView;
    private _pinnedCommands: CommandDefinition[] = [];
    private _recentCommands: CommandDefinition[] = [];
    private _commands: CommandDefinition[] = [];
    private _quickPickShortcut: string = '';
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getCommands: () => Promise<CommandDefinition[]>,
        private readonly _executeCommand: (command: CommandDefinition) => Promise<void>
    ) {
        // Log when the provider is constructed
        console.log("MinimizedCommandsWebviewProvider constructed");
        // Get the quickpick shortcut from settings
        this._quickPickShortcut = this._getQuickPickShortcut();
        
        // Listen for configuration changes to update the shortcut
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('terminalAssistant.quickPickShortcut')) {
                this._quickPickShortcut = this._getQuickPickShortcut();
                this.refresh();
            }
        });
    }
    
    // Get the quickpick shortcut from settings
    private _getQuickPickShortcut(): string {
        const config = vscode.workspace.getConfiguration('terminalAssistant');
        return config.get<string>('quickPickShortcut', '');
    }
    
    /**
     * Called when the view becomes visible
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        console.log("MinimizedCommandsWebviewProvider.resolveWebviewView called");
        
        this._view = webviewView;
        
        // Make sure to set options before setting HTML content
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        
        // Set an initial message while loading
        webviewView.webview.html = `
            <html>
            <head>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        text-align: center;
                    }
                    .spinner {
                        width: 30px;
                        height: 30px;
                        border: 3px solid rgba(120, 120, 120, 0.2);
                        border-radius: 50%;
                        border-top-color: var(--vscode-button-background);
                        animation: spin 1s infinite linear;
                        margin-bottom: 10px;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div>
                    <div class="spinner"></div>
                    <div>Loading commands...</div>
                </div>
            </body>
            </html>
        `;
        
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log("Received message from minimized view:", message.type);
            
            switch (message.type) {
                case 'executeCommand':
                    if (message.command) {
                        try {
                            // Add a try/catch specifically for command execution
                            try {
                                await this._executeCommand(message.command);
                            } catch (commandError) {
                                console.error("Command execution error:", commandError);
                                vscode.window.showErrorMessage(`Command execution failed: ${commandError instanceof Error ? 
                                    commandError.message : String(commandError)}`);
                            }
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
                        }
                    }
                    break;
                    
                case 'openCommandsList':
                    vscode.commands.executeCommand('terminalAssistant.focusTerminalCommands');
                    break;
                    
                case 'addCommand':
                    vscode.commands.executeCommand('terminalAssistant.addCommandFromTree');
                    break;
                    
                case 'quickPick':
                    vscode.commands.executeCommand('extension.runTerminalCommand');
                    break;
            }
        });
        
        // Increase delay before loading commands to ensure the view is properly initialized
        setTimeout(() => {
            // Load commands after everything is set up
            this._getCommands().then(commands => {
                console.log(`MinimizedCommandsWebviewProvider: Fetched ${commands.length} commands`);
                this._commands = commands;
                this.refresh();
            }).catch(err => {
                console.error("Error loading initial commands for minimized view:", err);
                // Show error in webview
                if (webviewView && webviewView.webview) {
                    webviewView.webview.html = `
                        <html>
                        <body style="padding: 10px;">
                            <div style="color: var(--vscode-errorForeground);">
                                Error loading commands: ${err}
                            </div>
                            <button style="margin-top: 10px;" onclick="location.reload()">Retry</button>
                        </body>
                        </html>
                    `;
                }
            });
        }, 500); // Increased from 300 to 500ms
    }
    
    /**
     * Refresh the webview content
     */
    public async refresh() {
        try {
            if (!this._view) {
                return;
            }

            // Update the commands if needed
            if (!this._commands || this._commands.length === 0) {
                this._commands = await this._getCommands();
            }

            // Get the local path to style resources
            const styleUri = this._view.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'minimized-commands.css')
            );
            
            const scriptUri = this._view.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'media', 'minimized-commands.js')
            );

            // Get path to the Codicons in VS Code
            const codiconsUri = this._view.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
            );

            // Generate HTML
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, {
                styleUri,
                scriptUri,
                codiconsUri,
                commands: this._commands,
                pinnedCommands: this._pinnedCommands,
                recentCommands: this._recentCommands,
                quickPickShortcut: this._quickPickShortcut
            });

            // Post a message to update data in the webview
            this._view.webview.postMessage({
                type: 'refreshCommands',
                commands: this._commands,
                pinnedCommands: this._pinnedCommands,
                recentCommands: this._recentCommands,
                quickPickShortcut: this._quickPickShortcut
            });
        } catch (err) {
            console.error("Error refreshing minimized view:", err);
        }
    }

    /**
     * Update pinned commands
     */
    public updatePinnedCommands(commands: CommandDefinition[]) {
        this._pinnedCommands = commands;
        if (this._view && this._view.visible) {
            this._view.webview.postMessage({
                type: 'refreshCommands',
                commands: this._commands,
                pinnedCommands: this._pinnedCommands,
                recentCommands: this._recentCommands
            });
        }
    }

    /**
     * Update recent commands
     */
    public updateRecentCommands(commands: CommandDefinition[]) {
        this._recentCommands = commands;
        if (this._view && this._view.visible) {
            this._view.webview.postMessage({
                type: 'refreshCommands',
                commands: this._commands,
                pinnedCommands: this._pinnedCommands,
                recentCommands: this._recentCommands
            });
        }
    }

    // Private method to generate the HTML for the webview
    private _getHtmlForWebview(webview: vscode.Webview, resources: any): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${resources.codiconsUri}" rel="stylesheet" />
            <link href="${resources.styleUri}" rel="stylesheet">
            <title>Terminal Commands</title>
            <style>
                /* Inline critical styles for faster rendering */
                body.minimized-view {
                    padding: 0;
                    margin: 0;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    font-size: var(--vscode-font-size);
                    overflow: hidden;
                }
                .minimized-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                }
                .compact-toolbar {
                    display: flex;
                    padding: 2px 4px;
                    background-color: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
                    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
                    justify-content: space-between;
                }
                .tool-group {
                    display: flex;
                    gap: 2px;
                }
                .scrollable-content {
                    overflow-y: auto;
                    flex: 1;
                }
                .shortcut-hint {
                    margin-left: 4px;
                    opacity: 0.7;
                    font-size: 0.85em;
                }
            </style>
            <script>
                // Initialize data
                window.allCommands = ${JSON.stringify(resources.commands)};
                window.pinnedCommands = ${JSON.stringify(resources.pinnedCommands)};
                window.recentCommands = ${JSON.stringify(resources.recentCommands)};
                window.quickPickShortcut = ${JSON.stringify(resources.quickPickShortcut)};
            </script>
        </head>
        <body class="minimized-view">
            <div class="minimized-container">
                <div class="compact-toolbar">
                    <div class="tool-group">
                        <button id="addCommandBtn" class="tool-button" title="Add New Command">
                            <i class="codicon codicon-add"></i>
                        </button>
                        <button id="quickPickBtn" class="tool-button" title="Quick Pick Command${
                            resources.quickPickShortcut ? ` (${resources.quickPickShortcut})` : ''
                        }">
                            <i class="codicon codicon-list-selection"></i>
                            ${resources.quickPickShortcut ? `<span class="shortcut-hint">${resources.quickPickShortcut}</span>` : ''}
                        </button>
                    </div>
                    <div class="tool-group">
                        <button id="openFullViewBtn" class="tool-button" title="Open Full View">
                            <i class="codicon codicon-open-preview"></i>
                        </button>
                    </div>
                </div>
                
                <div class="scrollable-content">
                    <div class="commands-section">
                        <div class="section-header foldable" data-target="pinnedCommandsList">
                            <div class="header-content">
                                <i class="codicon codicon-pin section-icon"></i>
                                <span class="section-title">Pinned Commands</span>
                            </div>
                            <i class="codicon codicon-chevron-down fold-icon"></i>
                        </div>
                        <div class="commands-list" id="pinnedCommandsList">
                            <!-- Will be populated by JS -->
                        </div>
                    </div>
                    
                    <div class="commands-section">
                        <div class="section-header foldable" data-target="recentCommandsList">
                            <div class="header-content">
                                <i class="codicon codicon-history section-icon"></i>
                                <span class="section-title">Recent Commands</span>
                            </div>
                            <i class="codicon codicon-chevron-down fold-icon"></i>
                        </div>
                        <div class="commands-list" id="recentCommandsList">
                            <!-- Will be populated by JS -->
                        </div>
                    </div>
                </div>
                
                <div class="status-footer">
                    <span id="commandCount">${resources.commands.length} terminal commands available</span>
                </div>
            </div>
            
            <script src="${resources.scriptUri}"></script>
        </body>
        </html>`;
    }
}
