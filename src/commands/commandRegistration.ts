import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { CommandStorageService } from '../services/commandStorageService';
import { executeCommand } from '../services/terminalService';
import { CommandEditorWebview } from '../webviews/commandEditorWebview';
import { buildGroupHierarchyForQuickPick, formatGroupsForQuickPick } from '../utils/groupUtils';
import { TerminalCommandsWebviewProvider } from '../webviews/terminalCommandsWebviewProvider';

export function registerCommands(
    context: vscode.ExtensionContext,
    storageService: CommandStorageService,
    webviewProvider: TerminalCommandsWebviewProvider
): void {
    const commandEditorWebview = new CommandEditorWebview(
        context.extensionUri,
        storageService,
        () => webviewProvider.refresh()
    );

    // Register WebView commands
    context.subscriptions.push(
        vscode.commands.registerCommand('terminalAssistant.refreshTreeView', () => {
            webviewProvider.refresh();
        }),

        vscode.commands.registerCommand('terminalAssistant.addCommandFromTree', async () => {
            await commandEditorWebview.showCommandEditorWebview();
        }),

        vscode.commands.registerCommand(
            'terminalAssistant.removeCommandFromTree',
            async (item: { commandDefinition: CommandDefinition }) => {
                if (!item.commandDefinition) {
                    return;
                }

                const commands = await storageService.loadCommands();
                const updatedCommands = commands.filter(cmd => cmd.label !== item.commandDefinition.label);
                const saved = await storageService.saveCommands(updatedCommands);

                if (saved) {
                    vscode.window.showInformationMessage(
                        `Command "${item.commandDefinition.label}" removed successfully.`
                    );
                    webviewProvider.refresh();
                }
            }
        ),

        vscode.commands.registerCommand(
            'terminalAssistant.editCommandFromTree',
            async (item: { commandDefinition: CommandDefinition }) => {
                if (!item.commandDefinition) {
                    return;
                }

                await commandEditorWebview.showCommandEditorWebview(item.commandDefinition);
            }
        ),

        vscode.commands.registerCommand('terminalAssistant.searchCommands', () => {
            if (webviewProvider["_view"]) {
                webviewProvider["_view"].webview.postMessage({ type: 'focusSearch' });
            }
        }),

        vscode.commands.registerCommand('terminalAssistant.openCommandEditor',
            async (commandToEdit?: CommandDefinition) => {
                await commandEditorWebview.showCommandEditorWebview(commandToEdit);
            }
        )
    );

    // Register command palette commands
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.runTerminalCommand', async () => {
            const commands = await storageService.loadCommands();

            if (commands.length === 0) {
                vscode.window.showWarningMessage('No terminal commands defined. Please add commands to your configuration.');
                return;
            }

            // Extract all unique group paths
            const allPaths = [...new Set(commands.map(cmd => cmd.group))];

            // Build a hierarchical structure for better display
            const groupHierarchy = buildGroupHierarchyForQuickPick(allPaths);

            // Format groups for the quick pick
            const groupOptions = formatGroupsForQuickPick(groupHierarchy);

            // Add an "All Commands" option at the top
            groupOptions.unshift({
                label: "All Commands",
                description: `(${commands.length} commands)`,
                path: ""
            });

            // Ask user to select a group first
            const selectedGroup = await vscode.window.showQuickPick(
                groupOptions,
                { placeHolder: 'Select a command group or view all' }
            );

            if (!selectedGroup) return;

            // Filter commands by selected group if needed
            const filteredCommands = selectedGroup.path === ""
                ? commands // All commands
                : commands.filter(cmd => cmd.group === selectedGroup.path || cmd.group.startsWith(selectedGroup.path + '/'));

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
        }),

        vscode.commands.registerCommand('extension.addTerminalCommand', async () => {
            await commandEditorWebview.showCommandEditorWebview();
        }),

        vscode.commands.registerCommand('extension.removeTerminalCommand', async () => {
            const commands = await storageService.loadCommands();

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
                const saved = await storageService.saveCommands(updatedCommands);

                if (saved) {
                    vscode.window.showInformationMessage(`Command "${commandToRemove.label}" removed successfully.`);
                    webviewProvider.refresh();
                }
            }
        }),

        vscode.commands.registerCommand('extension.listTerminalCommands', async () => {
            const commands = await storageService.loadCommands();

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
        }),

        vscode.commands.registerCommand('terminalAssistant.toggleStorage', async () => {
            const config = vscode.workspace.getConfiguration('terminalAssistant');
            const currentStorage = config.get<string>('storage', 'workspace');

            // Create quick pick items
            const options = [
                {
                    label: 'Workspace',
                    description: 'Store commands in the current workspace',
                    detail: 'Commands will be saved in a terminal-commands.json file in your project',
                    target: 'workspace'
                },
                {
                    label: 'Global',
                    description: 'Store commands globally (shared across workspaces)',
                    detail: 'Commands will be saved in your user settings and available in all projects',
                    target: 'global'
                }
            ];

            // Highlight the current selection
            const selectedOption = options.find(o => o.target === currentStorage);
            if (selectedOption) {
                selectedOption.description = `✓ ${selectedOption.description}`;
            }

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select where to store terminal commands'
            });

            if (selection && selection.target !== currentStorage) {
                // Update setting
                await config.update('storage', selection.target, vscode.ConfigurationTarget.Global);

                // Show confirmation
                vscode.window.showInformationMessage(`Terminal Assistant: Now using ${selection.label.toLowerCase()} storage for commands`);

                // Ask if user wants to migrate existing commands
                const shouldMigrate = await vscode.window.showInformationMessage(
                    'Would you like to migrate your existing commands to the new storage location?',
                    'Yes', 'No'
                );

                if (shouldMigrate === 'Yes') {
                    await storageService.migrateCommands(currentStorage, selection.target);
                }

                // Refresh the view
                webviewProvider.refresh();
            }
        })
    );

    // Command to run command from tree
    context.subscriptions.push(
        vscode.commands.registerCommand('terminalAssistant.runCommandFromTree',
            async (command: CommandDefinition) => {
                await executeCommand(command);
            }
        )
    );
}
