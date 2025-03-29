import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { executeCommand } from '../services/terminalService';
import { createFreshTerminal } from '../utils/terminalUtils';
import { showTimedInformationMessage } from '../utils/notificationUtils';

/**
 * Force execute a command in a brand new terminal
 */
export async function forceExecuteInNewTerminal() {
    try {
        // Get all available commands
        const commandPalette = vscode.commands.executeCommand('extension.listTerminalCommands');
        
        // Let the user pick a command from the list
        const selectedCommand = await vscode.window.showQuickPick(
            commandPalette as Thenable<CommandDefinition[]>,
            {
                placeHolder: 'Select command to execute in a new terminal',
                matchOnDescription: true,
                matchOnDetail: true
            }
        );
        
        if (!selectedCommand) {
            return; // User cancelled
        }
        
        // Create a new terminal explicitly
        createFreshTerminal();
        
        // Let the user know what's happening
        showTimedInformationMessage(`Executing "${selectedCommand.label}" in a new terminal...`, 2000);
        
        // Small delay to ensure the terminal is ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Execute the command
        await executeCommand(selectedCommand);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to execute command: ${error instanceof Error ? error.message : String(error)}`);
    }
}
