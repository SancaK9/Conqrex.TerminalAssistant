import * as vscode from 'vscode';
import { CommandsTreeProvider } from './commandsTreeProvider';

export class SearchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'terminalCommandsSearch';
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _treeProvider: CommandsTreeProvider
    ) {}
    
    resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = {
            enableScripts: true
        };
        
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        
        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'search') {
                this._treeProvider.setSearchTerm(data.searchTerm);
            }
        });
    }
    
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 0;
                        margin: 0;
                    }
                    .search-container {
                        padding: 10px 12px;
                        background: var(--vscode-sideBar-background);
                        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
                    }
                    .search-input-container {
                        display: flex;
                        align-items: center;
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border, transparent);
                        border-radius: 3px;
                    }
                    .search-input-container:focus-within {
                        border-color: var(--vscode-focusBorder);
                        outline: none;
                    }
                    .search-icon {
                        display: inline-flex;
                        padding: 0 6px;
                        opacity: 0.7;
                    }
                    .search-input {
                        flex: 1;
                        border: none;
                        background: transparent;
                        color: var(--vscode-input-foreground);
                        padding: 4px 0;
                        font-size: 13px;
                        line-height: 18px;
                    }
                    .search-input:focus {
                        outline: none;
                    }
                    .clear-button {
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        padding: 0 6px;
                        color: var(--vscode-icon-foreground);
                        opacity: 0.7;
                        display: none;
                    }
                    .clear-button:hover {
                        opacity: 1;
                    }
                </style>
            </head>
            <body>
                <div class="search-container">
                    <div class="search-input-container">
                        <span class="search-icon">$(search)</span>
                        <input 
                            type="text" 
                            class="search-input" 
                            id="searchInput" 
                            placeholder="Search commands..."
                        />
                        <button id="clearButton" class="clear-button">$(close)</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const searchInput = document.getElementById('searchInput');
                    const clearButton = document.getElementById('clearButton');
                    
                    searchInput.addEventListener('input', () => {
                        const value = searchInput.value;
                        clearButton.style.display = value ? 'block' : 'none';
                        vscode.postMessage({
                            command: 'search',
                            searchTerm: value
                        });
                    });
                    
                    clearButton.addEventListener('click', () => {
                        searchInput.value = '';
                        clearButton.style.display = 'none';
                        vscode.postMessage({
                            command: 'search',
                            searchTerm: ''
                        });
                        searchInput.focus();
                    });
                    
                    // Auto focus search input
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(() => searchInput.focus(), 100);
                    });
                </script>
            </body>
            </html>`;
    }
}