import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { getCommandEditorHtml } from './webviewHtmlRenderer';
import { CommandStorageService } from '../services/commandStorageService';
import { showTimedInformationMessage, showTimedErrorMessage } from '../utils/notificationUtils';

export class CommandEditorWebview {
    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly storageService: CommandStorageService,
        private readonly refreshWebview: () => void
    ) {}

    /**
     * Opens a command editor webview for adding or editing a command
     */
    async showCommandEditorWebview(commandToEdit?: CommandDefinition): Promise<void> {
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
        const commands = await this.storageService.loadCommands();
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

                        const saved = await this.storageService.saveCommands(commands);
                        if (saved) {
                            await showTimedInformationMessage(
                                commandToEdit
                                    ? `Command "${newCommand.label}" updated successfully.`
                                    : `Command "${newCommand.label}" added successfully.`,
                                3000
                            );
                            this.refreshWebview();
                            panel.dispose();
                        }
                    } catch (error) {
                        await showTimedErrorMessage(`Error saving command: ${error}`, 5000);
                    }
                    break;

                case 'cancel':
                    panel.dispose();
                    break;
            }
        });

        // Set webview content
        panel.webview.html = getCommandEditorHtml(panel.webview, this.extensionUri, commandToEdit, groups);
    }
}
