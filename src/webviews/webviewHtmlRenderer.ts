import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

/**
 * Generates HTML content for the command editor webview
 */
export function getCommandEditorHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    commandToEdit?: CommandDefinition,
    existingGroups: string[] = [],
    existingShortcuts: {label: string, keybinding: string}[] = [] // Add this parameter
): string {
    // Get the webview-specific URIs for our resources
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
    const commandEditorStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'command-editor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'command-editor.js'));
    const dropdownFixUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dropdown-fix.js')); // Add this line
    const codiconsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    );

    // Prepare command data for form
    const commandData = commandToEdit ? JSON.stringify(commandToEdit) : 'null';
    const groupsData = JSON.stringify(existingGroups);
    const shortcutsData = JSON.stringify(existingShortcuts.filter(s => 
        s.keybinding && (!commandToEdit || s.label !== commandToEdit.label)
    ));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${commandToEdit ? 'Edit' : 'Add'} Terminal Command</title>
    <link rel="stylesheet" href="${styleUri}">
    <link rel="stylesheet" href="${commandEditorStyleUri}">
    <link rel="stylesheet" href="${codiconsUri}">
    <script src="${dropdownFixUri}"></script>
    <style>
        /* Loader styling */
        .loader-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            backdrop-filter: blur(3px);
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            pointer-events: none;
        }
        
        .loader-overlay.active {
            opacity: 1;
            pointer-events: all;
        }
        
        .loader-spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: var(--vscode-button-background);
            animation: spin 1s ease-in-out infinite;
            margin-bottom: 15px;
        }
        
        .loader-text {
            color: var(--vscode-foreground);
            font-size: 16px;
            font-weight: 500;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="form-container">
        <div class="form-header">
            <h2>
                <i class="codicon codicon-${commandToEdit ? 'edit' : 'add'}" style="margin-right: 8px;"></i>
                ${commandToEdit ? 'Edit Terminal Command' : 'Create New Terminal Command'}
            </h2>
        </div>
        
        <div class="card">
            <div class="card-header">
                <i class="codicon codicon-terminal-bash card-icon"></i>
                <h3>Basic Information</h3>
            </div>
            
            <div class="form-group">
                <label for="label">
                    <i class="codicon codicon-tag" style="margin-right: 5px;"></i> Command Name:
                </label>
                <input type="text" id="label" placeholder="Enter a name for this command" required>
                <div class="help-text">A short, descriptive name for the command</div>
            </div>
            
            <div class="form-group">
                <label for="command">
                    <i class="codicon codicon-code" style="margin-right: 5px;"></i> Command:
                </label>
                <textarea id="command" placeholder="Enter the terminal command" required></textarea>
                <div class="help-text">Use {parameter} syntax to define parameters (e.g., dotnet add package {packageName} {version})</div>
            </div>
            
            <div class="form-group">
                <label for="description">
                    <i class="codicon codicon-note" style="margin-right: 5px;"></i> Description:
                </label>
                <textarea id="description" placeholder="Enter an optional description"></textarea>
            </div>
        </div>
        
        <div class="card-grid">
            <div class="card">
                <div class="card-header">
                    <i class="codicon codicon-folder-active card-icon"></i>
                    <h3>Organization</h3>
                </div>
                
                <div class="form-group">
                    <label for="group-display">
                        <i class="codicon codicon-list-tree" style="margin-right: 5px;"></i> Group:
                    </label>
                    <div style="display: flex; gap: 10px;">
                        <div class="custom-dropdown-container" style="flex-grow: 1;">
                            <div class="custom-dropdown-header" id="selected-group-display">
                                <span id="selected-group-text">-- Select a group --</span>
                                <i class="codicon codicon-chevron-down dropdown-icon"></i>
                            </div>
                            <input type="hidden" id="group" value="">
                            <div class="custom-dropdown-content" id="group-dropdown-content">
                                <div class="dropdown-search">
                                    <div style="display: flex; align-items: center;">
                                        <i class="codicon codicon-search" style="margin-right: 5px;"></i>
                                        <input type="text" id="group-search" placeholder="Search groups...">
                                    </div>
                                </div>
                                <div class="dropdown-tree" id="group-tree"></div>
                            </div>
                        </div>
                        <button id="addGroupBtn" class="secondary" type="button">
                            <i class="codicon codicon-add"></i> New
                        </button>
                    </div>
                    <div class="help-text">You can use '/' to create nested groups (e.g., "Development/Frontend")</div>
                </div>
                
                <div class="form-group">
                    <label for="keybinding">
                        <i class="codicon codicon-keyboard" style="margin-right: 5px;"></i> Keyboard Shortcut: 
                        <span class="optional-badge">Optional</span>
                    </label>
                    <div class="keybinding-container">
                        <input type="text" id="keybinding" placeholder="e.g. ctrl+alt+1" 
                               autocomplete="off" spellcheck="false">
                        <button id="recordKeybindingBtn" class="secondary" type="button">
                            <i class="codicon codicon-record"></i> Record
                        </button>
                        <button id="clearKeybindingBtn" class="secondary small-btn" type="button" title="Clear Shortcut">
                            <i class="codicon codicon-close"></i>
                        </button>
                    </div>
                    <div class="help-text">
                        Optionally set a keyboard shortcut to run this command directly.
                        Format: ctrl+shift+alt+key (use cmd instead of ctrl on Mac).
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <i class="codicon codicon-settings-gear card-icon"></i>
                    <h3>Behavior Options</h3>
                </div>
                
                <div class="checkbox-container">
                    <input type="checkbox" id="autoExecute">
                    <label for="autoExecute">
                        <i class="codicon codicon-run-all" style="margin-right: 5px;"></i> Auto-execute this command
                    </label>
                </div>
                <div class="help-text">Run immediately when selected without additional confirmation</div>

                <div class="checkbox-container" style="margin-top: 16px;">
                    <input type="checkbox" id="clearTerminal">
                    <label for="clearTerminal">
                        <i class="codicon codicon-clear-all" style="margin-right: 5px;"></i> Clear terminal history
                    </label>
                </div>
                <div class="help-text">Clear the terminal output before executing this command</div>

                <div class="checkbox-container" style="margin-top: 16px;">
                    <input type="checkbox" id="escapeKeyBefore" checked>
                    <label for="escapeKeyBefore">
                        <i class="codicon codicon-debug-step-back" style="margin-right: 5px;"></i> Send escape key before
                    </label>
                </div>
                <div class="help-text">Sends an escape key to clear the current line before executing</div>
            </div>
        </div>
        
        <!-- Parameters card moved outside the grid to take full width -->
        <div class="card">
            <div class="card-header">
                <i class="codicon codicon-symbol-parameter card-icon"></i>
                <h3>Command Parameters</h3>
            </div>
            
            <div class="form-group">
                <div class="parameters-section">
                    <div class="parameters-header">
                        <div style="display: flex; align-items: center;">
                            <i class="codicon codicon-bracket" style="margin-right: 8px;"></i>
                            <span id="parameters-title">Detected Parameters</span>
                        </div>
                        <span id="parameters-count" class="optional-badge">(0)</span>
                    </div>
                    
                    <div id="parameters-container">
                        <div class="parameters-empty-state" id="no-parameters-message">
                            <div class="empty-state-icon">
                                <i class="codicon codicon-bracket"></i>
                            </div>
                            <div class="empty-state-message">
                                <p>No parameters detected yet.</p>
                                <p>Add parameters to your command using the syntax <span class="example-tag">{parameterName}</span>.</p>
                                <p>For example: <span class="example-tag">git commit -m "{message}"</span></p>
                            </div>
                        </div>
                        
                        <!-- This will be populated with parameter cards dynamically -->
                        <div class="parameter-cards" id="parameter-cards-container">
                            <!-- Example of parameter card (will be generated dynamically by JS) -->
                            <!--
                            <div class="parameter-card">
                                <div class="parameter-badge">1</div>
                                <div class="parameter-name">
                                    <i class="codicon codicon-symbol-parameter"></i>
                                    packageName
                                </div>
                                <div class="parameter-options">
                                    <div class="parameter-option">
                                        <div class="parameter-option-label">Default:</div>
                                        <div class="parameter-option-input">
                                            <input type="text" placeholder="Default value (optional)">
                                        </div>
                                    </div>
                                    <div class="parameter-option">
                                        <div class="parameter-option-label">Type:</div>
                                        <div class="parameter-option-input">
                                            <select>
                                                <option value="text">Text</option>
                                                <option value="number">Number</option>
                                                <option value="path">File path</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div class="parameter-controls">
                                    <div>
                                        <span class="parameter-tag">{packageName}</span>
                                    </div>
                                    <div>
                                        <button class="param-action-btn" title="Parameter options">
                                            <i class="codicon codicon-gear"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            -->
                        </div>
                    </div>
                    
                    <div class="help-text" style="padding: 12px 16px; border-top: 1px solid var(--vscode-panel-border);">
                        <i class="codicon codicon-light-bulb" style="margin-right: 5px;"></i>
                        Parameters are automatically detected from your command as you type. Use <span class="example-tag">{parameterName}</span> syntax.
                    </div>
                </div>
            </div>
        </div>
        
        <div class="button-container">
            <button class="secondary" id="cancelBtn" type="button">
                <i class="codicon codicon-close" style="margin-right: 5px;"></i> Cancel
            </button>
            <button class="primary" id="saveBtn" type="button">
                <i class="codicon codicon-save" style="margin-right: 5px;"></i> Save Command
            </button>
        </div>
    </div>
    
    <!-- Custom Dialog for New Group -->
    <div class="dialog-overlay" id="groupDialogOverlay">
        <div class="dialog">
            <div class="dialog-content vertical">
                <h3><i class="codicon codicon-add" style="margin-right: 8px;"></i> Create New Group</h3>
                <div class="form-group">
                    <label for="newGroupName">
                        <i class="codicon codicon-folder" style="margin-right: 5px;"></i> Group Name:
                    </label>
                    <input type="text" id="newGroupName" placeholder="Enter group name">
                    <div class="help-text">
                        <i class="codicon codicon-info"></i> 
                        Use forward slashes (/) to create nested groups
                    </div>
                </div>
                <div class="dialog-buttons vertical">
                    <button class="primary" id="createGroupBtn" type="button">
                        <i class="codicon codicon-check"></i> Create Group
                    </button>
                    <button class="secondary" id="cancelGroupBtn" type="button">
                        <i class="codicon codicon-close"></i> Cancel
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Loader Overlay -->
    <div class="loader-overlay" id="loaderOverlay">
        <div class="loader-spinner"></div>
        <div class="loader-text" id="loaderText">Saving command...</div>
    </div>

    <!-- Pass data to script as global variables -->
    <script>
        window.commandToEdit = ${commandData};
        window.existingGroups = ${groupsData};
        window.existingShortcuts = ${shortcutsData}; 
    </script>
    
    <!-- Load external script -->
    <script src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Generates HTML content for the minimized commands webview (bottom bar)
 */
export function getMinimizedCommandsHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    allCommands: CommandDefinition[],
    pinnedCommands: CommandDefinition[] = [],
    recentCommands: CommandDefinition[] = []
): string {
    // Get the webview-specific URIs for our resources
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
    const minimizedStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'minimized-commands.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'minimized-commands.js'));
    const codiconsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    );

    // Prepare commands data for the view
    const commandsData = JSON.stringify(allCommands);
    const pinnedData = JSON.stringify(pinnedCommands);
    const recentData = JSON.stringify(recentCommands);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terminal Commands</title>
    <link rel="stylesheet" href="${styleUri}">
    <link rel="stylesheet" href="${minimizedStyleUri}">
    <link rel="stylesheet" href="${codiconsUri}">
</head>
<body class="minimized-view">
    <div class="minimized-container">
        <div class="toolbar">
            <button class="tool-button" id="addCommandBtn" title="Add Command">
                <i class="codicon codicon-add"></i>
            </button>
            <button class="tool-button" id="quickPickBtn" title="Quick Command Picker">
                <i class="codicon codicon-list-selection"></i>
            </button>
            <button class="tool-button" id="openFullViewBtn" title="Open Full Commands View">
                <i class="codicon codicon-panel-maximize"></i>
            </button>
        </div>
        
        <div class="commands-section">
            <div class="section-header">
                <i class="codicon codicon-pin"></i>
                <span>Pinned</span>
            </div>
            <div class="commands-list" id="pinnedCommandsList">
                <!-- Dynamically filled -->
            </div>
        </div>
        
        <div class="commands-section">
            <div class="section-header">
                <i class="codicon codicon-history"></i>
                <span>Recent</span>
            </div>
            <div class="commands-list" id="recentCommandsList">
                <!-- Dynamically filled -->
            </div>
        </div>

        <div class="status-footer">
            <span id="commandCount">${allCommands.length} terminal commands available</span>
        </div>
    </div>

    <!-- Pass data to script -->
    <script>
        window.allCommands = ${commandsData};
        window.pinnedCommands = ${pinnedData};
        window.recentCommands = ${recentData};
    </script>
    
    <!-- Load external script -->
    <script src="${scriptUri}"></script>
</body>
</html>`;
}