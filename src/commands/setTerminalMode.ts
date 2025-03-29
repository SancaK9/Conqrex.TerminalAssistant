import * as vscode from 'vscode';
import { showTimedInformationMessage } from '../utils/notificationUtils';

/**
 * Command to set the terminal mode
 */
export async function setTerminalMode(): Promise<void> {
    try {
        const config = vscode.workspace.getConfiguration('terminalAssistant');
        const currentMode = config.get<string>('terminalMode', 'reuseExisting');
        
        const options = [
            {
                label: 'Reuse Existing Terminals',
                description: 'Try to reuse existing terminals when possible',
                value: 'reuseExisting'
            },
            {
                label: 'Always Create New Terminal',
                description: 'Create a new terminal for each command',
                value: 'alwaysNew'
            },
            {
                label: 'Smart Reuse',
                description: 'Intelligently choose whether to reuse or create new terminal',
                value: 'smartReuse'
            }
        ];
        
        const selectedOption = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select terminal mode',
            matchOnDescription: true
        });
        
        if (selectedOption) {
            await config.update('terminalMode', selectedOption.value, vscode.ConfigurationTarget.Global);
            showTimedInformationMessage(`Terminal mode set to: ${selectedOption.label}`, 3000);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error setting terminal mode: ${error instanceof Error ? error.message : String(error)}`);
    }
}
