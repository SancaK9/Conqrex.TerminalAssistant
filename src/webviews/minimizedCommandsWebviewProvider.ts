import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { getMinimizedCommandsHtml } from './webviewHtmlRenderer';

/**
 * WebView provider for the minimized commands panel that appears in the bottom bar
 */
export class MinimizedCommandsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalAssistant.minimizedCommandsView';
    
    private _view?: vscode.WebviewView;
    private _pinnedCommands: CommandDefinition[] = [];
    private _recentCommands: CommandDefinition[] = [];
    private _commands: CommandDefinition[] = [];
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _getCommands: () => Promise<CommandDefinition[]>,
        private readonly _executeCommand: (command: CommandDefinition) => Promise<void>
    ) {
        // Log when the provider is constructed
        console.log("MinimizedCommandsWebviewProvider constructed");
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
                            await this._executeCommand(message.command);
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to execute command: ${error}`);
                        }
                    }
                    break;
                    
                case 'openCommandsList':
                    vscode.commands.executeCommand('workbench.view.extension.terminal-assistant');
                    break;
                    
                case 'addCommand':
                    vscode.commands.executeCommand('terminalAssistant.addCommandFromTree');
                    break;
                    
                case 'quickPick':
                    vscode.commands.executeCommand('extension.runTerminalCommand');
                    break;
            }
        });
        
        // Give a small delay before loading commands to ensure the view is properly initialized
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
        }, 300);
    }
    
    /**
     * Refresh the webview content
     */
    public async refresh() {
        console.log("MinimizedCommandsWebviewProvider.refresh called");
        
        if (!this._view) {
            console.log("Cannot refresh, view is not available");
            return;
        }
        
        try {
            // Get all commands if we don't have them yet
            if (!this._commands || this._commands.length === 0) {
                this._commands = await this._getCommands();
            }
            
            // Generate the HTML and set it to the webview
            this._view.webview.html = getMinimizedCommandsHtml(
                this._view.webview,
                this._extensionUri,
                this._commands,
                this._pinnedCommands,
                this._recentCommands
            );
            
            console.log("Updated minimized view HTML");
        } catch (error) {
            console.error('Error refreshing minimized commands view:', error);
            // Show error in webview
            if (this._view && this._view.webview) {
                this._view.webview.html = `
                    <html>
                    <body>
                        <div style="color: var(--vscode-errorForeground); padding: 10px;">
                            Error refreshing view: ${error}
                        </div>
                        <button style="margin: 10px;" onclick="document.location.reload()">Refresh</button>
                    </body>
                    </html>
                `;
            }
        }
    }
    
    /**
     * Update pinned commands
     */
    public updatePinnedCommands(commands: CommandDefinition[]) {
        console.log(`Updating ${commands.length} pinned commands in minimized view`);
        this._pinnedCommands = commands;
        this.refresh();
    }
    
    /**
     * Update recent commands
     */
    public updateRecentCommands(commands: CommandDefinition[]) {
        console.log(`Updating ${commands.length} recent commands in minimized view`);
        this._recentCommands = commands;
        this.refresh();
    }
}
