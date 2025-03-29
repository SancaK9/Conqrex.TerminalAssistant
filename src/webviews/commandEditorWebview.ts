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
        // Get all groups for the dropdown
        const commands = await this.storageService.loadCommands();
        const groups = [...new Set(commands.map(cmd => cmd.group))].filter(Boolean).sort();
        
        // Extract shortcut data for validation
        const shortcutData = commands
            .filter(cmd => cmd.keybinding && (!commandToEdit || cmd.label !== commandToEdit.label))
            .map(cmd => ({ label: cmd.label, keybinding: cmd.keybinding as string }));

        // Create webview
        const panel = vscode.window.createWebviewPanel(
            'terminalCommandEditor',
            commandToEdit ? `Edit Command: ${commandToEdit.label}` : 'Add Terminal Command',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri]
            }
        );
        
        // Set webview content
        panel.webview.html = getCommandEditorHtml(
            panel.webview, 
            this.extensionUri, 
            commandToEdit, 
            groups,
            shortcutData // Pass the shortcut data
        );

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'saveCommand':
                    try {
                        const newCommand: CommandDefinition = message.commandData;
                        console.log('Received save command request:', newCommand.label);

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

                        // Save commands first
                        console.log('Saving command...');
                        const saved = await this.storageService.saveCommands(commands);
                        
                        if (saved) {
                            console.log('Command saved successfully');
                            
                            try {
                                // Refresh webview first
                                console.log('Refreshing webview...');
                                this.refreshWebview();
                                
                                // Ensure all UI updates complete with a delay
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                // Notify the webview that save was successful
                                console.log('Sending success message to webview');
                                panel.webview.postMessage({ command: 'saveSuccess' });
                                
                                // Wait a bit before disposing to ensure message is received
                                setTimeout(() => {
                                    // This will be executed after the delay
                                    panel.dispose();
                                    
                                    // Show success message after panel is gone
                                    showTimedInformationMessage(
                                        commandToEdit
                                            ? `Command "${newCommand.label}" updated successfully.`
                                            : `Command "${newCommand.label}" added successfully.`,
                                        3000
                                    );
                                }, 300);
                            }
                            catch (err) {
                                console.error('Error during UI operations:', err);
                                // Still try to close the panel in case of UI refresh errors
                                panel.webview.postMessage({ command: 'saveSuccess' });
                                setTimeout(() => panel.dispose(), 300);
                            }
                        } else {
                            // If save failed, notify the webview to hide loader
                            console.error('Failed to save command');
                            panel.webview.postMessage({ 
                                command: 'saveError',
                                message: 'Failed to save command.'
                            });
                        }
                    } catch (error) {
                        console.error('Error saving command:', error);
                        
                        // If there was an error, notify the webview
                        panel.webview.postMessage({ 
                            command: 'saveError',
                            message: `Error saving command: ${error}`
                        });
                        await showTimedErrorMessage(`Error saving command: ${error}`, 5000);
                    }
                    break;

                case 'cancel':
                    panel.dispose();
                    break;
            }
        });
    }
}
