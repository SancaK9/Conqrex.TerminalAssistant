import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

/**
 * Service for managing dynamically registered keybindings for commands
 */
export class KeybindingService {
    // Keep track of registered keybindings
    private registeredKeybindings: Map<string, vscode.Disposable> = new Map();
    
    constructor() {}

    /**
     * Register keybindings for commands that have them defined
     * @param commands List of command definitions
     */
    public async registerCommandKeybindings(
        commands: CommandDefinition[],
        executeCommandCallback: (command: CommandDefinition) => Promise<void>
    ): Promise<void> {
        // First dispose all previously registered keybindings
        this.disposeAllKeybindings();
        
        // Register new keybindings for commands that have them
        for (const cmd of commands) {
            if (cmd.keybinding && cmd.keybinding.trim() !== '') {
                // Create a unique command ID for this keybinding
                const commandId = `terminalAssistant.runCommand.${cmd.label.replace(/[^a-zA-Z0-9]/g, '_')}`;
                
                // Register the command
                const disposable = vscode.commands.registerCommand(commandId, async () => {
                    try {
                        await executeCommandCallback(cmd);
                        // Show feedback that the command was executed
                        vscode.window.setStatusBarMessage(
                            `Terminal Assistant: Executed "${cmd.label}"`, 
                            3000
                        );
                    } catch (error) {
                        console.error('Error executing command:', error);
                        const errorMessage = error instanceof Error 
                            ? error.message 
                            : String(error);
                        vscode.window.showErrorMessage(
                            `Failed to execute command "${cmd.label}": ${errorMessage}`
                        );
                    }
                });
                
                // Store the disposable so we can remove it later
                this.registeredKeybindings.set(commandId, disposable);
                
                console.log(`Registered keyboard shortcut: ${cmd.keybinding} for "${cmd.label}"`);
            }
        }
    }
    
    /**
     * Dispose all registered keybindings
     */
    private disposeAllKeybindings(): void {
        for (const [id, disposable] of this.registeredKeybindings) {
            disposable.dispose();
        }
        this.registeredKeybindings.clear();
    }
    
    /**
     * Dispose all resources
     */
    public dispose(): void {
        this.disposeAllKeybindings();
    }
}