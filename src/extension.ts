import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandsTreeProvider, CommandTreeItem, CommandDefinition, CommandParameter } from './commandsTreeProvider';
import { SearchViewProvider } from './searchViewProvider';
import { TerminalCommandsView } from './terminalCommandsView';

// Remove the duplicate interfaces since we're importing them
const COMMANDS_FILENAME = 'terminal-commands.json';

export function activate(context: vscode.ExtensionContext) {
    // Find or create project-based command file
    async function findOrCreateCommandsFile(): Promise<string | undefined> {
        // Check if we have an active workspace
        if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length === 0) {
            const createGlobal = await vscode.window.showInformationMessage(
                'No workspace folder found. Would you like to use global commands instead?',
                'Yes', 'No'
            );

            if (createGlobal === 'Yes') {
                // Use global storage as fallback
                const globalCommandsPath = path.join(context.globalStoragePath, COMMANDS_FILENAME);

                // Ensure directory exists
                if (!fs.existsSync(path.dirname(globalCommandsPath))) {
                    fs.mkdirSync(path.dirname(globalCommandsPath), { recursive: true });
                }

                return globalCommandsPath;
            }
            return undefined;
        }

        // Look for the commands file in the workspace folders
        for (const folder of vscode.workspace.workspaceFolders) {
            const possiblePath = path.join(folder.uri.fsPath, COMMANDS_FILENAME);
            if (fs.existsSync(possiblePath)) {
                return possiblePath;
            }
        }

        // If not found, ask if user wants to create one
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const suggestedPath = path.join(workspaceRoot, COMMANDS_FILENAME);

        const createFile = await vscode.window.showInformationMessage(
            `No ${COMMANDS_FILENAME} found in workspace. Would you like to create one?`,
            'Yes', 'No'
        );

        if (createFile === 'Yes') {
            // Create a new empty commands file
            try {
                fs.writeFileSync(suggestedPath, JSON.stringify([], null, 2), 'utf8');
                vscode.window.showInformationMessage(`Created ${COMMANDS_FILENAME} in workspace root folder.`);
                return suggestedPath;
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create ${COMMANDS_FILENAME}: ${error}`);
            }
        }

        return undefined;
    }

    // Modified load commands function
    async function loadCommands(): Promise<CommandDefinition[]> {
        const commandsPath = await findOrCreateCommandsFile();

        if (!commandsPath) {
            return [];
        }

        try {
            const fileContent = fs.readFileSync(commandsPath, 'utf-8');
            const parsedCommands = JSON.parse(fileContent);

            // Add backward compatibility
            return parsedCommands.map((cmd: any) => ({
                ...cmd,
                autoExecute: cmd.hasOwnProperty('autoExecute') ? cmd.autoExecute : true,
                group: cmd.hasOwnProperty('group') ? cmd.group : 'General',
                parameters: cmd.hasOwnProperty('parameters') ? cmd.parameters : undefined
            }));
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load terminal commands: ${error}`);
            return [];
        }
    }

    // Modified save commands function
    async function saveCommands(commands: CommandDefinition[]): Promise<boolean> {
        const commandsPath = await findOrCreateCommandsFile();

        if (!commandsPath) {
            return false;
        }

        try {
            fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2), 'utf-8');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save terminal commands: ${error}`);
            return false;
        }
    }

    // Add a function to execute a command
    async function executeCommand(commandDef: CommandDefinition): Promise<void> {
        let finalCommand = commandDef.command;

        // Handle parameters if any
        if (commandDef.parameters && commandDef.parameters.length > 0) {
            // Ask for parameter values
            for (const param of commandDef.parameters) {
                const paramValue = await vscode.window.showInputBox({
                    placeHolder: param.description || `Enter value for ${param.name}`,
                    prompt: `Parameter: ${param.name}`,
                    value: param.defaultValue || ''
                });

                // Replace parameter in command
                if (paramValue !== undefined) {  // Allow empty strings but not undefined (cancelled)
                    finalCommand = finalCommand.replace(new RegExp(`\\{${param.name}\\}`, 'g'), paramValue);
                } else {
                    // User cancelled parameter input
                    return;
                }
            }
        }

        // Get active terminal or create one
        let terminal = vscode.window.activeTerminal;
        if (!terminal) {
            terminal = vscode.window.createTerminal('Terminal Assistant');
        }

        terminal.show();

        // If auto-execute is enabled, send the command with a newline
        // Otherwise, just write the command to the terminal without executing it
        if (commandDef.autoExecute) {
            terminal.sendText(finalCommand);
        } else {
            // This writes the command but doesn't execute it
            terminal.sendText(finalCommand, false);
        }
    }

    // Register the tree view provider with search functionality
    _commandsTreeProvider = new CommandsTreeProvider(() => loadCommands());
    const terminalCommandsView = new TerminalCommandsView(context, _commandsTreeProvider);

    // Register command to run a command from the tree view
    const runFromTreeDisposable = vscode.commands.registerCommand('terminalAssistant.runCommandFromTree',
        (commandDef: CommandDefinition) => {
            executeCommand(commandDef);
        }
    );

    // Register a command to refresh the tree view
    const refreshTreeDisposable = vscode.commands.registerCommand('terminalAssistant.refreshTreeView', () => {
        _commandsTreeProvider.refresh();
    });

    // Register a command to add a command from the tree view
    const addFromTreeDisposable = vscode.commands.registerCommand('terminalAssistant.addCommandFromTree', async () => {
        // Use the new webview-based UI instead
        await showCommandEditorWebview(context.extensionUri);
    });

    // Register a command to remove a command from the tree view
    const removeFromTreeDisposable = vscode.commands.registerCommand('terminalAssistant.removeCommandFromTree',
        async (item: CommandTreeItem) => {
            if (!item.commandDefinition) {
                return;
            }

            const commands = await loadCommands();
            const updatedCommands = commands.filter(cmd => cmd.label !== item.commandDefinition!.label);
            const saved = await saveCommands(updatedCommands);

            if (saved) {
                vscode.window.showInformationMessage(`Command "${item.commandDefinition.label}" removed successfully.`);
                _commandsTreeProvider.refresh();
            }
        }
    );

    // Register a command to edit a command from the tree view
    const editFromTreeDisposable = vscode.commands.registerCommand(
        'terminalAssistant.editCommandFromTree',
        async (item: CommandTreeItem) => {
            if (!item.commandDefinition) {
                return;
            }

            // Use the new webview-based UI
            await showCommandEditorWebview(context.extensionUri, item.commandDefinition);
        }
    );

    // Register the main command to show and execute terminal commands
    const disposable = vscode.commands.registerCommand('extension.runTerminalCommand', async () => {
        const commands = await loadCommands();

        if (commands.length === 0) {
            vscode.window.showWarningMessage('No terminal commands defined. Please add commands to your configuration.');
            return;
        }

        // Get all available groups
        const groups = [...new Set(commands.map(cmd => cmd.group))].sort();

        // Ask user to select a group first
        const selectedGroup = groups.length > 1
            ? await vscode.window.showQuickPick(
                ['All Commands', ...groups],
                { placeHolder: 'Select a command group or view all' }
            )
            : 'All Commands';

        if (!selectedGroup) return;

        // Filter commands by selected group if needed
        const filteredCommands = selectedGroup === 'All Commands'
            ? commands
            : commands.filter(cmd => cmd.group === selectedGroup);

        // Show quick pick with available commands
        const selectedItem = await vscode.window.showQuickPick(
            filteredCommands.map(cmd => ({
                label: cmd.label,
                description: cmd.description || cmd.command,
                detail: `${cmd.group} ${cmd.autoExecute ? '(Auto Execute)' : '(Manual Execute)'} ${cmd.parameters && cmd.parameters.length > 0 ? `(${cmd.parameters.length} params)` : ''}`,
                command: cmd
            })),
            { placeHolder: 'Select a command to run in terminal' }
        );

        if (!selectedItem) return;

        await executeCommand(selectedItem.command);
    });

    // Update the main add command to use the webview as well
    const addCommandDisposable = vscode.commands.registerCommand('extension.addTerminalCommand', async () => {
        await showCommandEditorWebview(context.extensionUri);
    });

    // Register a command to remove existing terminal commands
    const removeCommandDisposable = vscode.commands.registerCommand('extension.removeTerminalCommand', async () => {
        const commands = await loadCommands();

        if (commands.length === 0) {
            vscode.window.showWarningMessage('No terminal commands defined to remove.');
            return;
        }

        const commandToRemove = await vscode.window.showQuickPick(
            commands.map(cmd => ({
                label: cmd.label,
                description: cmd.description || cmd.command,
                detail: cmd.autoExecute ? '(Auto Execute)' : '(Manual Execute)',
                command: cmd.command
            })),
            { placeHolder: 'Select a command to remove' }
        );

        if (commandToRemove) {
            const updatedCommands = commands.filter(cmd => cmd.label !== commandToRemove.label);
            const saved = await saveCommands(updatedCommands);

            if (saved) {
                vscode.window.showInformationMessage(`Command "${commandToRemove.label}" removed successfully.`);
            }
        }
    });

    // Register a command to list all terminal commands
    const listCommandsDisposable = vscode.commands.registerCommand('extension.listTerminalCommands', async () => {
        const commands = await loadCommands();

        if (commands.length === 0) {
            vscode.window.showWarningMessage('No terminal commands defined.');
            return;
        }

        // Create a virtual document to display commands
        const commandsPanel = vscode.window.createWebviewPanel(
            'terminalCommands',
            'Terminal Commands',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        // Group commands by their groups for better organization
        const groupedCommands: Record<string, CommandDefinition[]> = {};
        commands.forEach(cmd => {
            if (!groupedCommands[cmd.group]) {
                groupedCommands[cmd.group] = [];
            }
            groupedCommands[cmd.group].push(cmd);
        });

        // Format commands as HTML table
        const content = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background-color: rgba(3, 175, 255, 0.86); color: white; }
                    tr:hover { background-color: rgb(245, 245, 245); }
                    .command { font-family: monospace; background-color: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
                    .param { color: #0066cc; font-weight: bold; }
                    h3 { margin-top: 25px; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 5px; }
                    .params { margin-top: 5px; padding-left: 15px; font-size: 0.9em; color: #555; }
                    .param-item { margin-bottom: 3px; }
                </style>
            </head>
            <body>
                <h2>Terminal Commands</h2>
                ${Object.entries(groupedCommands).map(([groupName, cmds]) => `
                    <h3>${groupName}</h3>
                    <table>
                        <tr>
                            <th>Label</th>
                            <th>Command</th>
                            <th>Description</th>
                            <th>Mode</th>
                        </tr>
                        ${cmds.map(cmd => {
            // Highlight parameters in command
            let highlightedCommand = cmd.command;
            if (cmd.parameters) {
                for (const param of cmd.parameters) {
                    highlightedCommand = highlightedCommand.replace(
                        new RegExp(`\\{${param.name}\\}`, 'g'),
                        `<span class="param">{${param.name}}</span>`
                    );
                }
            }

            return `
                                <tr>
                                    <td>${cmd.label}</td>
                                    <td>
                                        <code class="command">${highlightedCommand}</code>
                                        ${cmd.parameters && cmd.parameters.length > 0 ? `
                                            <div class="params">
                                                <div><small>Parameters:</small></div>
                                                ${cmd.parameters.map(p => `
                                                    <div class="param-item">
                                                        <small>
                                                            <b>${p.name}</b>
                                                            ${p.description ? ` - ${p.description}` : ''}
                                                            ${p.defaultValue ? ` (default: "${p.defaultValue}")` : ''}
                                                        </small>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                    </td>
                                    <td>${cmd.description || '-'}</td>
                                    <td>${cmd.autoExecute ? 'Auto' : 'Manual'}</td>
                                </tr>
                            `;
        }).join('')}
                    </table>
                `).join('')}
                <p><small>Total commands: ${commands.length}</small></p>
            </body>
            </html>
        `;

        commandsPanel.webview.html = content;
    });

    // Register command to open the command editor webview
    const openCommandEditorDisposable = vscode.commands.registerCommand('terminalAssistant.openCommandEditor',
        async (commandToEdit?: CommandDefinition) => {
            await showCommandEditorWebview(context.extensionUri, commandToEdit);
        }
    );

    // Assign the loadCommands and saveCommands functions to module scope variables
    _loadCommandsFunction = loadCommands;
    _saveCommandsFunction = saveCommands;

    // Add to subscriptions
    context.subscriptions.push(openCommandEditorDisposable);

    context.subscriptions.push(
        disposable,
        addCommandDisposable,
        removeCommandDisposable,
        listCommandsDisposable,
        runFromTreeDisposable,
        refreshTreeDisposable,
        addFromTreeDisposable,
        removeFromTreeDisposable,
        editFromTreeDisposable
    );

    // Initial tree refresh
    _commandsTreeProvider.refresh();
}

// Define functions and variables in the module scope
let _loadCommandsFunction: () => Promise<CommandDefinition[]>;
let _saveCommandsFunction: (commands: CommandDefinition[]) => Promise<boolean>;
let _commandsTreeProvider: CommandsTreeProvider;

// Expose these functions at module level for use in webviews
async function loadCommands(): Promise<CommandDefinition[]> {
    if (!_loadCommandsFunction) {
        throw new Error('loadCommands function not initialized');
    }
    return _loadCommandsFunction();
}

async function saveCommands(commands: CommandDefinition[]): Promise<boolean> {
    if (!_saveCommandsFunction) {
        throw new Error('saveCommands function not initialized');
    }
    return _saveCommandsFunction(commands);
}

// Function to show command editor webview
async function showCommandEditorWebview(extensionUri: vscode.Uri, commandToEdit?: CommandDefinition): Promise<void> {
    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
        'terminalCommandEditor',
        commandToEdit ? `Edit Command: ${commandToEdit.label}` : 'Add New Terminal Command',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Get all existing commands and groups
    const commands = await _loadCommandsFunction();
    const groups = [...new Set(commands.map(cmd => cmd.group))].sort();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'saveCommand':
                try {
                    const newCommand: CommandDefinition = message.commandData;

                    // If editing, update existing command
                    if (commandToEdit) {
                        const commandIndex = commands.findIndex(cmd => cmd.label === commandToEdit.label);
                        if (commandIndex !== -1) {
                            commands[commandIndex] = newCommand;
                        } else {
                            commands.push(newCommand);
                        }
                    } else {
                        // Add new command
                        commands.push(newCommand);
                    }

                    const saved = await saveCommands(commands);
                    if (saved) {
                        vscode.window.showInformationMessage(
                            commandToEdit
                                ? `Command "${newCommand.label}" updated successfully.`
                                : `Command "${newCommand.label}" added successfully.`
                        );
                        _commandsTreeProvider.refresh();
                        panel.dispose();
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error saving command: ${error}`);
                }
                break;

            case 'cancel':
                panel.dispose();
                break;
        }
    });

    // Set webview content
    panel.webview.html = getCommandEditorHtml(panel.webview, extensionUri, commandToEdit, groups);
}

// Function to get the HTML for the command editor webview
function getCommandEditorHtml(
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
            
            // Add all existing groups
            existingGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                groupSelect.appendChild(option);
            });
            
            // Add default group if no groups exist
            if (existingGroups.length === 0) {
                const option = document.createElement('option');
                option.value = 'General';
                option.textContent = 'General';
                groupSelect.appendChild(option);
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
            const paramRegex = /\\{([^{}]+)\\}/g;
            const matches = [...commandText.matchAll(paramRegex)];
            const uniqueParams = [];
            
            // Extract unique parameter names
            matches.forEach(match => {
                const paramName = match[1];
                if (!uniqueParams.some(p => p.name === paramName)) {
                    const existingParam = commandToEdit && commandToEdit.parameters ? 
                        commandToEdit.parameters.find(p => p.name === paramName) : null;
                    
                    uniqueParams.push({
                        name: paramName,
                        description: existingParam ? existingParam.description : '',
                        defaultValue: existingParam ? existingParam.defaultValue : ''
                    });
                }
            });
            
            // Update UI
            const container = document.getElementById('parameters-container');
            container.innerHTML = '';
            document.getElementById('parameters-count').textContent = \`(\${uniqueParams.length})\`;
            
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
                        <input type="text" class="param-description" value="\${param.description || ''}" 
                            placeholder="Description for this parameter">
                    </div>
                    <div class="form-group">
                        <label>Default Value:</label>
                        <input type="text" class="param-default" value="\${param.defaultValue || ''}" 
                            placeholder="Default value">
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
            const newGroup = document.getElementById('newGroupName').value;
            
            if (newGroup && newGroup.trim()) {
                const trimmedGroupName = newGroup.trim();
                const groupSelect = document.getElementById('group');
                
                // Check if group already exists to avoid duplication
                let exists = false;
                for (let i = 0; i < groupSelect.options.length; i++) {
                    if (groupSelect.options[i].value === trimmedGroupName) {
                        exists = true;
                        break;
                    }
                }
                
                if (!exists) {
                    // Add the new option
                    const option = document.createElement('option');
                    option.value = trimmedGroupName;
                    option.textContent = trimmedGroupName;
                    groupSelect.appendChild(option);
                }
                
                // Select the new option
                groupSelect.value = trimmedGroupName;
                
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