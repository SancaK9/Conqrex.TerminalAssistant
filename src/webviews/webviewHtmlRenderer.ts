import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

/**
 * Generates HTML content for the command editor webview
 * @param webview The webview to generate HTML for
 * @param extensionUri The extension's URI for resource access
 * @param commandToEdit Optional command definition when editing an existing command
 * @param existingGroups Array of existing group names for the dropdown
 * @returns HTML string for the webview content
 */
export function getCommandEditorHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    commandToEdit?: CommandDefinition,
    existingGroups: string[] = []
): string {
    // Use this to access CSS and other resources
    const getWebviewUri = (path: string) => {
        return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', path)).toString();
    };

    // Get the CSS file URI
    const styleUri = getWebviewUri('style.css');

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
    <style>
    /* Critical dialog styles that will work even if the external CSS fails to load */
    .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: none; /* Hidden by default */
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    
    .dialog {
        background-color: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-foreground, #cccccc);
        border-radius: 6px;
        padding: 24px;
        width: 400px;
        max-width: 90%;
        box-shadow: 0 3px 16px rgba(0, 0, 0, 0.3);
        border: 1px solid var(--vscode-panel-border, #555);
        animation: dialogFadeIn 0.2s ease-out;
    }
    
    @keyframes dialogFadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .dialog h3 {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 18px;
        border-bottom: 1px solid var(--vscode-panel-border, #555);
        padding-bottom: 8px;
        color: var(--vscode-editor-foreground, #fff);
    }
    
    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
        gap: 10px;
    }
    
    /* Vertical button layout */
    .dialog-buttons.vertical {
        flex-direction: column;
    }
    
    .dialog-buttons.vertical button {
        width: 100%;
        padding: 10px;
        text-align: center;
    }
    
    /* Ensure input has consistent styling */
    #newGroupName {
        width: 100%;
        padding: 10px;
        background-color: var(--vscode-input-background, #3c3c3c);
        color: var(--vscode-input-foreground, #cccccc);
        border: 1px solid var(--vscode-input-border, #555);
        border-radius: 2px;
        margin-top: 5px;
        font-size: 14px;
    }
</style>
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
            <label for="group">Group:</label>
            <div style="display: flex; gap: 10px;">
                <select id="group" style="flex-grow: 1;"></select>
                <button id="addGroupBtn" class="secondary" type="button">New Group</button>
            </div>
            <div class="help-text">You can use '/' to create nested groups (e.g., "Development/Frontend")</div>
        </div>
        
        <div class="checkbox-container">
            <input type="checkbox" id="autoExecute">
            <label for="autoExecute">Auto-execute this command (run immediately when selected)</label>
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

    <script>
        // Initialize with data
        const commandToEdit = ${commandData};
        const existingGroups = ${groupsData};
        const vscode = acquireVsCodeApi();
        
        // Populate the form with existing data if editing
        function initializeForm() {
            // Populate groups dropdown
            const groupSelect = document.getElementById('group');
            
            // Clear any existing options first
            groupSelect.innerHTML = '';
            
            // Add an empty option at the beginning for better UX
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- Select a group --';
            groupSelect.appendChild(defaultOption);
            
            // Sort groups to ensure parent groups come before subgroups
            const sortedGroups = [...existingGroups].sort((a, b) => {
                const aDepth = a.split('/').length;
                const bDepth = b.split('/').length;
                if (aDepth === bDepth) {
                    return a.localeCompare(b);
                }
                return aDepth - bDepth;
            });
            
            // Add all existing groups with proper indentation
            sortedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                
                // Add indentation based on nesting level
                const depth = group.split('/').length;
                const indent = '— '.repeat(depth - 1);
                const lastSegment = group.split('/').pop();
                
                option.textContent = indent + lastSegment;
                option.title = group;  // Show full path on hover
                groupSelect.appendChild(option);
            });
            
            // Add default group if no groups exist
            if (existingGroups.length === 0) {
                const option = document.createElement('option');
                option.value = 'General';
                option.textContent = 'General';
                groupSelect.appendChild(option);
            }
            
            // Set the selected group if editing
            if (commandToEdit && commandToEdit.group) {
                // If the group doesn't exist in the dropdown, add it
                if (!existingGroups.includes(commandToEdit.group)) {
                    const option = document.createElement('option');
                    option.value = commandToEdit.group;
                    
                    // Add indentation for new group too
                    const depth = commandToEdit.group.split('/').length;
                    const indent = '— '.repeat(depth - 1);
                    const lastSegment = commandToEdit.group.split('/').pop();
                    
                    option.textContent = indent + lastSegment;
                    option.title = commandToEdit.group;
                    groupSelect.appendChild(option);
                }
                
                groupSelect.value = commandToEdit.group;
            }
            
            if (commandToEdit) {
                // Fill form with existing command data
                document.getElementById('label').value = commandToEdit.label || '';
                document.getElementById('command').value = commandToEdit.command || '';
                document.getElementById('description').value = commandToEdit.description || '';
                document.getElementById('autoExecute').checked = commandToEdit.autoExecute || false;
                
                // Set the group if editing
                if (commandToEdit.group) {
                    const groupExists = existingGroups.includes(commandToEdit.group);
                    if (!groupExists) {
                        // Add the group if it doesn't exist in dropdown
                        const option = document.createElement('option');
                        option.value = commandToEdit.group;
                        option.textContent = commandToEdit.group;
                        groupSelect.appendChild(option);
                    }
                    groupSelect.value = commandToEdit.group;
                }
                
                // Update parameters
                updateParametersFromCommand();
            }
        }
        
        // Extract and display parameters from the command string
        function updateParametersFromCommand() {
    const commandText = document.getElementById('command').value;
    const paramRegex = /\{([^{}]+)\}/g;
    const matches = [...commandText.matchAll(paramRegex)];
    const uniqueParams = [];
    
    // Get current parameter inputs to preserve user edits
    const currentParams = {};
    document.querySelectorAll('.parameter-item').forEach(item => {
        const paramName = item.dataset.param;
        const description = item.querySelector('.param-description')?.value || '';
        const defaultValue = item.querySelector('.param-default')?.value || '';
        
        currentParams[paramName] = {
            description,
            defaultValue
        };
    });
    
    // Extract unique parameter names
    matches.forEach(match => {
        const paramName = match[1];
        if (!uniqueParams.some(p => p.name === paramName)) {
            // Check three possible sources for parameter data in priority order:
            // 1. Current form values (to preserve user edits)
            // 2. Original command being edited
            // 3. Default empty values
            
            // First check if we have this parameter in the form already
            if (currentParams[paramName]) {
                uniqueParams.push({
                    name: paramName,
                    description: currentParams[paramName].description,
                    defaultValue: currentParams[paramName].defaultValue
                });
            }
            // Then check if it exists in the command being edited
            else {
                const existingParam = commandToEdit && commandToEdit.parameters ? 
                    commandToEdit.parameters.find(p => p.name === paramName) : null;
                
                uniqueParams.push({
                    name: paramName,
                    description: existingParam ? existingParam.description : '',
                    defaultValue: existingParam ? existingParam.defaultValue : ''
                });
            }
        }
    });
    
    // Update UI
    const container = document.getElementById('parameters-container');
    container.innerHTML = '';
    document.getElementById('parameters-count').textContent = "(" + uniqueParams.length + ")";
    
    if (uniqueParams.length === 0) {
        container.innerHTML = '<div class="help-text">No parameters detected. Use {paramName} in your command to add parameters.</div>';
        return;
    }
    
    // Create UI for each parameter
    uniqueParams.forEach((param, index) => {
        const paramItem = document.createElement('div');
        paramItem.className = 'parameter-item';
        paramItem.dataset.param = param.name;
        
        paramItem.innerHTML = \`
        <div class="form-group">
            <label>Parameter Name:</label>
            <input type="text" class="param-name" value="\${param.name}" readonly>
        </div>
        <div class="form-group">
            <label>Description:</label>
            <input type="text" class="param-description" value="\${param.description || ''}" placeholder="Description for this parameter">
        </div>
        <div class="form-group">
            <label>Default Value:</label>
            <input type="text" class="param-default" value="\${param.defaultValue || ''}" placeholder="Default value">
        </div>
        \`;
        
        container.appendChild(paramItem);
    });
}
        
        // Function to show custom dialog
        function showGroupDialog() {
            console.log('Opening new group dialog');
            const overlay = document.getElementById('groupDialogOverlay');
            overlay.style.display = 'flex';
            
            // Focus the input after a small delay to ensure the dialog is visible
            setTimeout(() => {
                const input = document.getElementById('newGroupName');
                if (input) {
                    input.focus();
                    input.value = '';  // Clear any previous value
                }
            }, 50);
        }
        
        // Function to hide custom dialog
        function hideGroupDialog() {
            console.log('Closing dialog');
            document.getElementById('groupDialogOverlay').style.display = 'none';
        }
        
        // Function to handle adding a new group
        function addNewGroup() {
            showGroupDialog();
        }
        
        // Function to create a new group from dialog input
        function createNewGroup() {
            const newGroup = document.getElementById('newGroupName').value.trim();
            
            if (newGroup) {
                const groupSelect = document.getElementById('group');
                
                // Check if group already exists to avoid duplication
                let exists = false;
                for (let i = 0; i < groupSelect.options.length; i++) {
                    if (groupSelect.options[i].value === newGroup) {
                        exists = true;
                        break;
                    }
                }
                
                if (!exists) {
                    // Add the new option
                    const option = document.createElement('option');
                    option.value = newGroup;
                    
                    // Add indentation based on nesting level
                    const depth = newGroup.split('/').length;
                    const indent = '— '.repeat(depth - 1);
                    const lastSegment = newGroup.split('/').pop();
                    
                    option.textContent = indent + lastSegment;
                    option.title = newGroup;  // Show full path on hover
                    groupSelect.appendChild(option);
                }
                
                // Select the new option
                groupSelect.value = newGroup;
                
                // Hide dialog
                hideGroupDialog();
            } else {
                alert('Please enter a valid group name');
            }
        }
        
        // Function to save the command
        function saveCommand() {
            // Validate form
            const label = document.getElementById('label').value.trim();
            const command = document.getElementById('command').value.trim();
            const description = document.getElementById('description').value.trim();
            const group = document.getElementById('group').value;
            const autoExecute = document.getElementById('autoExecute').checked;
            
            if (!label) {
                alert('Please enter a command name');
                return;
            }
            
            if (!command) {
                alert('Please enter a command');
                return;
            }
            
            if (!group) {
                alert('Please select or create a group');
                return;
            }
            
            // Collect parameters
            const parameters = [];
            const paramItems = document.querySelectorAll('.parameter-item');
            paramItems.forEach(item => {
                const name = item.dataset.param;
                const description = item.querySelector('.param-description').value.trim();
                const defaultValue = item.querySelector('.param-default').value.trim();
                
                parameters.push({
                    name,
                    description: description || undefined,
                    defaultValue: defaultValue || undefined
                });
            });
            
            // Create command object
            const commandData = {
                label,
                command,
                description: description || undefined,
                autoExecute,
                group,
                parameters: parameters.length > 0 ? parameters : undefined
            };
            
            // Send to extension
            vscode.postMessage({
                command: 'saveCommand',
                commandData
            });
        }
        
        // Set up event listeners
        function setupEventListeners() {
            // Main form buttons
            document.getElementById('addGroupBtn').addEventListener('click', addNewGroup);
            document.getElementById('command').addEventListener('input', updateParametersFromCommand);
            document.getElementById('cancelBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'cancel' });
            });
            document.getElementById('saveBtn').addEventListener('click', saveCommand);
            
            // Group dialog buttons
            document.getElementById('cancelGroupBtn').addEventListener('click', hideGroupDialog);
            document.getElementById('createGroupBtn').addEventListener('click', createNewGroup);
            
            // Allow Enter key to submit the dialog
            document.getElementById('newGroupName').addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    createNewGroup();
                } else if (event.key === 'Escape') {
                    hideGroupDialog();
                }
            });
            
            // Close dialog when clicking outside
            document.getElementById('groupDialogOverlay').addEventListener('click', (event) => {
                if (event.target === document.getElementById('groupDialogOverlay')) {
                    hideGroupDialog();
                }
            });
        }
        
        // Initialize when the document is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initializeForm();
                setupEventListeners();
            });
        } else {
            // DOM already loaded, initialize immediately
            initializeForm();
            setupEventListeners();
        }
    </script>
</body>
</html>`;
}