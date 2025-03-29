import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

export class TerminalCommandsWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'terminalCommandsWebview';
	private _view?: vscode.WebviewView;
	private _commands: CommandDefinition[] = [];
	private _isViewVisible: boolean = false;
	private _pinnedCommands: CommandDefinition[] = [];
	private _recentCommands: CommandDefinition[] = [];
	private _maxRecentCommands: number = 5; // Maximum number of recent commands to track

	// Add a state tracking variable
	private _viewState: {
		isLoaded: boolean;
		searchTerm?: string;
	} = { isLoaded: false };

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _loadCommands: () => Promise<CommandDefinition[]>,
		private readonly _executeCommand: (command: CommandDefinition) => Promise<void>,
		private readonly _storageManager?: {
			getPinnedCommands: () => CommandDefinition[],
			savePinnedCommands: (commands: CommandDefinition[]) => void,
			getRecentCommands: () => CommandDefinition[],
			saveRecentCommands: (commands: CommandDefinition[]) => void
		}
	) { 
		// Initialize pinned and recent commands from storage if available
		if (this._storageManager) {
			this._pinnedCommands = this._storageManager.getPinnedCommands();
			this._recentCommands = this._storageManager.getRecentCommands();
		}
	}

	public async refresh(): Promise<void> {
		this._commands = await this._loadCommands();
		if (this._view && this._view.visible) {
			this._view.webview.postMessage({
				type: 'refreshCommands',
				commands: this._commands,
				pinnedCommands: this._pinnedCommands,
				recentCommands: this._recentCommands
			});
		}
	}

	// Add method to save search state
	public saveSearchState(searchTerm: string): void {
		this._viewState.searchTerm = searchTerm;
	}

	// Add method to toggle pin status
	public togglePinStatus(command: CommandDefinition, isPinned: boolean): void {
		if (isPinned) {
			// Add to pinned commands if not already there
			if (!this._pinnedCommands.find(cmd => 
				cmd.label === command.label && 
				cmd.command === command.command && 
				cmd.group === command.group)) {
				this._pinnedCommands.push(command);
			}
		} else {
			// Remove from pinned commands
			this._pinnedCommands = this._pinnedCommands.filter(cmd => 
				!(cmd.label === command.label && 
				  cmd.command === command.command && 
				  cmd.group === command.group));
		}

		// Save pinned commands if storage manager is available
		if (this._storageManager) {
			this._storageManager.savePinnedCommands(this._pinnedCommands);
		}

		// Update the webview
		if (this._view && this._view.visible) {
			this._view.webview.postMessage({
				type: 'updatePinnedCommands',
				pinnedCommands: this._pinnedCommands
			});
		}
	}

	// Add method to track recent commands
	public trackRecentCommand(command: CommandDefinition): void {
		// Remove command from the list if it's already there
		this._recentCommands = this._recentCommands.filter(cmd => 
			!(cmd.label === command.label && 
			  cmd.command === command.command && 
			  cmd.group === command.group));
		
		// Add the command to the beginning of the list
		this._recentCommands.unshift(command);
		
		// Trim the list to the maximum size
		if (this._recentCommands.length > this._maxRecentCommands) {
			this._recentCommands = this._recentCommands.slice(0, this._maxRecentCommands);
		}

		// Save recent commands if storage manager is available
		if (this._storageManager) {
			this._storageManager.saveRecentCommands(this._recentCommands);
		}

		// Update the webview
		if (this._view && this._view.visible) {
			this._view.webview.postMessage({
				type: 'updateRecentCommands',
				recentCommands: this._recentCommands
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
					// Track the command in recent list after execution
					this.trackRecentCommand(data.command);
					break;

				case 'search':
					const searchTerm = data.searchTerm.toLowerCase();
					const filtered = this._commands.filter(cmd =>
						cmd.label.toLowerCase().includes(searchTerm) ||
						(cmd.description && cmd.description.toLowerCase().includes(searchTerm)) ||
						cmd.command.toLowerCase().includes(searchTerm) ||
						cmd.group.toLowerCase().includes(searchTerm)
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
					
				case 'togglePinCommand':
					this.togglePinStatus(data.command, data.isPinned);
					break;
                    
                case 'requestCommands':
                    // Explicitly refresh commands when requested by the webview
                    await this.refresh();
                    break;

				case 'saveSearchState':
					this.saveSearchState(data.searchTerm);
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

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'terminalCommands.js'));

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
				
				<!-- Tab Navigation -->
				<div class="tabs-container">
					<div class="tab-buttons">
						<button class="tab-button active" data-tab="all">
							<i class="codicon codicon-list-unordered"></i> All Commands
						</button>
						<button class="tab-button" data-tab="pinned">
							<i class="codicon codicon-pin"></i> Favorites
						</button>
						<button class="tab-button" data-tab="recent">
							<i class="codicon codicon-history"></i> Recent
						</button>
					</div>
				</div>
				
				<!-- Tab Content -->
				<div class="tab-content">
					<!-- All Commands Tab -->
					<div class="tab-pane active" id="allCommandsTab">
						<div id="commandsContainer" class="commands-wrapper"></div>
					</div>
					
					<!-- Pinned Commands Tab -->
					<div class="tab-pane" id="pinnedCommandsTab">
						<div id="pinnedCommandsContainer" class="commands-wrapper"></div>
					</div>
					
					<!-- Recent Commands Tab -->
					<div class="tab-pane" id="recentCommandsTab">
						<div id="recentCommandsContainer" class="commands-wrapper"></div>
					</div>
				</div>
				
				<!-- Make sure script loads before dialogs -->
				<script src="${scriptUri}"></script>
				
				<!-- Delete Confirmation Dialog -->
				<div class="dialog-overlay" id="deleteConfirmationDialog" style="display: none;">
					<div class="dialog">
						<div class="dialog-content vertical">
							<h3>Delete Command</h3>
							<p id="deleteConfirmationMessage">Are you sure you want to delete this command?</p>
							<div class="dialog-buttons vertical">
								<button class="primary danger" id="confirmDeleteBtn" type="button">Delete</button>
								<button class="secondary" id="cancelDeleteBtn" type="button">Cancel</button>
							</div>
						</div>
					</div>
				</div>
			</body>
			</html>`;
	}
}