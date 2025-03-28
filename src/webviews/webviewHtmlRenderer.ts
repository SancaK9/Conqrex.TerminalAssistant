import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

/**
 * Generates HTML content for the command editor webview
 */
export function getCommandEditorHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    commandToEdit?: CommandDefinition,
    existingGroups: string[] = []
): string {
    // Get the webview-specific URIs for our resources
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
    const commandEditorStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'command-editor.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'command-editor.js'));
    const codiconsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    );

    // Prepare command data for form
    const commandData = commandToEdit ? JSON.stringify(commandToEdit) : 'null';
    const groupsData = JSON.stringify(existingGroups);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${commandToEdit ? 'Edit' : 'Add'} Terminal Command</title>
    <link rel="stylesheet" href="${styleUri}">
    <link rel="stylesheet" href="${commandEditorStyleUri}">
    <link rel="stylesheet" href="${codiconsUri}">
</head>
<body>
    <div class="form-container">
        <h2>${commandToEdit ? 'Edit Terminal Command' : 'Create New Terminal Command'}</h2>
        
        <div class="form-group">
            <label for="label">Command Name:</label>
            <input type="text" id="label" placeholder="Enter a name for this command" required>
            <div class="help-text">A short, descriptive name for the command</div>
        </div>
        
        <div class="form-group">
            <label for="command">Command:</label>
            <textarea id="command" placeholder="Enter the terminal command" required></textarea>
            <div class="help-text">Use {parameter} syntax to define parameters (e.g., dotnet add package {packageName} {version})</div>
        </div>
        
        <div class="form-group">
            <label for="description">Description:</label>
            <textarea id="description" placeholder="Enter an optional description"></textarea>
        </div>
        
        <div class="form-group">
            <label for="group-display">Group:</label>
            <div style="display: flex; gap: 10px;">
                <div class="custom-dropdown-container" style="flex-grow: 1;">
                    <div class="custom-dropdown-header" id="selected-group-display">
                        <span id="selected-group-text">-- Select a group --</span>
                        <i class="codicon codicon-chevron-down dropdown-icon"></i>
                    </div>
                    <input type="hidden" id="group" value="">
                    <div class="custom-dropdown-content" id="group-dropdown-content">
                        <div class="dropdown-search">
                            <input type="text" id="group-search" placeholder="Search groups...">
                        </div>
                        <div class="dropdown-tree" id="group-tree"></div>
                    </div>
                </div>
                <button id="addGroupBtn" class="secondary" type="button">New Group</button>
            </div>
            <div class="help-text">You can use '/' to create nested groups (e.g., "Development/Frontend")</div>
        </div>
        
        <div class="checkbox-container">
            <input type="checkbox" id="autoExecute">
            <label for="autoExecute">Auto-execute this command (run immediately when selected)</label>
        </div>

        <div class="checkbox-container">
            <input type="checkbox" id="clearTerminal">
            <label for="clearTerminal">Clear terminal history before executing command</label>
        </div>

        <div class="checkbox-container">
            <input type="checkbox" id="escapeKeyBefore" checked>
            <label for="escapeKeyBefore">Send escape key before executing (clears current line)</label>
        </div>

<div class="form-group">
            <label for="keybinding">
                Keyboard Shortcut: <span class="optional-badge">Optional</span>
            </label>
            <div class="keybinding-container">
                <input type="text" id="keybinding" placeholder="e.g. ctrl+alt+1" 
                       autocomplete="off" spellcheck="false">
                <button id="recordKeybindingBtn" class="secondary" type="button">Record Keys</button>
                <button id="clearKeybindingBtn" class="secondary small-btn" type="button" title="Clear Shortcut">
                    <i class="codicon codicon-close"></i>
                </button>
            </div>
            <div class="help-text">
                Optionally set a keyboard shortcut to run this command directly.
                Format: ctrl+shift+alt+key (use cmd instead of ctrl on Mac).
            </div>
        </div>
        
        <div class="form-group">
            <label>Parameters:</label>
            <div class="parameters-section">
                <div class="parameters-header">
                    <span id="parameters-title">Detected Parameters</span>
                    <span id="parameters-count">(0)</span>
                </div>
                <div id="parameters-container">
                    <!-- Parameters will be added here dynamically -->
                </div>
                <div class="help-text">Parameters are automatically detected from the command using the {parameter} syntax</div>
            </div>
        </div>
        
        <div class="button-container">
            <button class="secondary" id="cancelBtn" type="button">Cancel</button>
            <button class="primary" id="saveBtn" type="button">Save Command</button>
        </div>
    </div>
    
    <!-- Custom Dialog for New Group -->
    <div class="dialog-overlay" id="groupDialogOverlay">
        <div class="dialog">
            <div class="dialog-content vertical">
                <h3>Create New Group</h3>
                <div class="form-group">
                    <label for="newGroupName">Group Name:</label>
                    <input type="text" id="newGroupName" placeholder="Enter group name">
                </div>
                <div class="dialog-buttons vertical">
                    <button class="primary" id="createGroupBtn" type="button">Create Group</button>
                    <button class="secondary" id="cancelGroupBtn" type="button">Cancel</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Pass data to script as global variables -->
    <script>
        window.commandToEdit = ${commandData};
        window.existingGroups = ${groupsData};
    </script>
    
    <!-- Load external script -->
    <script src="${scriptUri}"></script>
</body>
</html>`;
}