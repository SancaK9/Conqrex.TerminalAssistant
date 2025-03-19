import * as vscode from 'vscode';
import { CommandsTreeProvider } from './providers/commandsTreeProvider';
import { TerminalCommandsWebviewProvider } from './webviews/terminalCommandsWebviewProvider';
import { CommandStorageService } from './services/commandStorageService';
import { registerCommands } from './commands/commandRegistration';

export function activate(context: vscode.ExtensionContext) {
    // Initialize services
    const commandStorageService = new CommandStorageService(context);
    
    // Create terminal commands webview provider
    const terminalCommandsWebviewProvider = new TerminalCommandsWebviewProvider(
        context.extensionUri,
        () => commandStorageService.loadCommands(),
        async (command) => {
            const { executeCommand } = await import('./services/terminalService');
            return executeCommand(command);
        }
    );
    
    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            TerminalCommandsWebviewProvider.viewType,
            terminalCommandsWebviewProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    
    // Register commands
    registerCommands(context, commandStorageService, terminalCommandsWebviewProvider);
    
    // Initial refresh
    terminalCommandsWebviewProvider.refresh();
    
    // Show storage location message
    const config = vscode.workspace.getConfiguration('terminalAssistant');
    const storageLocation = config.get<string>('storage', 'global');
    vscode.window.setStatusBarMessage(
        `Terminal Assistant: Using ${storageLocation} storage for commands`,
        5000
    );
}