import * as vscode from 'vscode';
import { createFreshTerminal } from '../utils/terminalUtils';
import { showTimedInformationMessage } from '../utils/notificationUtils';

/**
 * Create a fresh terminal and make it active
 * This is useful when task terminals are causing issues
 */
export function createNewTerminal() {
    try {
        const terminal = createFreshTerminal();
        showTimedInformationMessage('Created new terminal', 2000);
        return terminal;
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create new terminal: ${error instanceof Error ? error.message : String(error)}`);
    }
}
