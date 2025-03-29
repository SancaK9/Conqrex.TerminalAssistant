import * as vscode from 'vscode';
import * as path from 'path';
import { CommandDefinition, CommandsTreeProvider } from './providers/commandsTreeProvider';
import { TerminalCommandsWebviewProvider } from './webviews/terminalCommandsWebviewProvider';
import { CommandStorageService } from './services/commandStorageService';
import { KeybindingService } from './services/keybindingService';
import { registerCommands } from './commands/commandRegistration';
import { executeCommand } from './services/terminalService';
import { MinimizedCommandsWebviewProvider } from './webviews/minimizedCommandsWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
    // Initialize services
    const commandStorageService = new CommandStorageService(context);
    const keybindingService = new KeybindingService();
    
    // Create terminal commands webview provider with storage manager
    const terminalCommandsWebviewProvider = new TerminalCommandsWebviewProvider(
        context.extensionUri,
        () => commandStorageService.loadCommands(),
        async (command) => {
            return executeCommand(command);
        },
        {
            getPinnedCommands: () => {
                try {
                    return context.globalState.get<CommandDefinition[]>('pinnedCommands') || [];
                } catch (err) {
                    console.error('Error loading pinned commands:', err);
                    return [];
                }
            },
            savePinnedCommands: (commands) => {
                try {
                    context.globalState.update('pinnedCommands', commands);
                } catch (err) {
                    console.error('Error saving pinned commands:', err);
                }
            },
            getRecentCommands: () => {
                try {
                    return context.globalState.get<CommandDefinition[]>('recentCommands') || [];
                } catch (err) {
                    console.error('Error loading recent commands:', err);
                    return [];
                }
            },
            saveRecentCommands: (commands) => {
                try {
                    context.globalState.update('recentCommands', commands);
                } catch (err) {
                    console.error('Error saving recent commands:', err);
                }
            }
        }
    );
    
    // Set the webview provider in the keybinding service
    keybindingService.setWebviewProvider(terminalCommandsWebviewProvider);
    
    // Register webview provider - ensure the viewType matches
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
    
    // Create minimized commands webview provider for bottom panel
    const minimizedCommandsProvider = new MinimizedCommandsWebviewProvider(
        context.extensionUri,
        () => commandStorageService.loadCommands(),
        async (command) => {
            await executeCommand(command);
            terminalCommandsWebviewProvider.trackRecentCommand(command);
        }
    );
    
    // Register the minimized webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MinimizedCommandsWebviewProvider.viewType,
            minimizedCommandsProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );
    
    // Keep the minimized view in sync when pinned/recent commands change
    terminalCommandsWebviewProvider.onPinnedCommandsChanged(commands => {
        minimizedCommandsProvider.updatePinnedCommands(commands);
    });
    
    terminalCommandsWebviewProvider.onRecentCommandsChanged(commands => {
        minimizedCommandsProvider.updateRecentCommands(commands);
    });
    
    // Register commands
    registerCommands(context, commandStorageService, terminalCommandsWebviewProvider);
    
    // Initial refresh
    terminalCommandsWebviewProvider.refresh();
    
    // Initialize keybindings from saved commands
    commandStorageService.loadCommands().then(async commands => {
        keybindingService.registerCommandKeybindings(commands, executeCommand);
        // Also update the keybindings.json file on startup if there are keybindings
        if (commands.some(cmd => cmd.keybinding && cmd.keybinding.trim() !== '')) {
            await updateKeybindingsJson(commands, keybindingService);
        }
    });
    
    // Listen for command changes to update keybindings
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('terminalAssistant')) {
                const commands = await commandStorageService.loadCommands();
                keybindingService.registerCommandKeybindings(commands, executeCommand);
            }
        })
    );
    
    // Register to refresh keybindings when commands are saved or removed
    const originalSaveCommands = commandStorageService.saveCommands;
    commandStorageService.saveCommands = async (commands) => {
        const result = await originalSaveCommands.call(commandStorageService, commands);
        if (result) {
            await keybindingService.registerCommandKeybindings(commands, executeCommand);
            
            // Always update keybindings.json to handle both adding and removing shortcuts
            await updateKeybindingsJson(commands, keybindingService);
        }
        return result;
    };
    
    // Show storage location message
    const config = vscode.workspace.getConfiguration('terminalAssistant');
    const storageLocation = config.get<string>('storage', 'global');
    setTimedStatusBarMessage(
        `Terminal Assistant: Using ${storageLocation} storage for commands`,
        5000
    );
    
    // Add a command to focus the full terminal commands view
    context.subscriptions.push(
        vscode.commands.registerCommand('terminalAssistant.focusTerminalCommands', () => {
            vscode.commands.executeCommand('workbench.view.extension.terminal-assistant');
        })
    );
    
    // Add new diagnostics to troubleshoot the issue
    console.log("Terminal Assistant activated");
    console.log("Registered view types:", 
        TerminalCommandsWebviewProvider.viewType,
        MinimizedCommandsWebviewProvider.viewType);
    
    // Try to check if the view providers are registered
    try {
        const viewExtension = vscode.extensions.getExtension('warderstudios.terminal-assistant');
        if (viewExtension) {
            console.log("Extension exists");
            
            // Force refresh both providers after a short delay to give time for panels to initialize
            setTimeout(async () => {
                try {
                    // Load commands once and pass to both views to ensure consistency
                    const commands = await commandStorageService.loadCommands();
                    console.log(`Loaded ${commands.length} commands`);
                    
                    // First update the data
                    try {
                        await terminalCommandsWebviewProvider.refresh();
                        console.log("Main view refreshed");
                    } catch (err) {
                        console.error("Error refreshing main view:", err);
                    }
                    
                    try {
                        // Get pinned and recent commands from the main provider
                        const pinnedCmds = terminalCommandsWebviewProvider["_pinnedCommands"] || [];
                        const recentCmds = terminalCommandsWebviewProvider["_recentCommands"] || [];
                        
                        // Update the minimized view with all data
                        minimizedCommandsProvider.updatePinnedCommands(pinnedCmds);
                        minimizedCommandsProvider.updateRecentCommands(recentCmds);
                        console.log("Minimized view data updated");
                    } catch (err) {
                        console.error("Error updating minimized view:", err);
                    }
                } catch (error) {
                    console.error("Error in delayed view refresh:", error);
                }
            }, 1500);
        }
    } catch (error) {
        console.error("Error checking extension:", error);
    }
    
    // Add keybindingService to extension context disposables
    context.subscriptions.push({ dispose: () => keybindingService.dispose() });
}

// Extract the keybindings.json update logic to a reusable function
async function updateKeybindingsJson(commands: CommandDefinition[], keybindingService: KeybindingService): Promise<void> {
    try {
        const commandsWithKeybindings = commands.filter(cmd => cmd.keybinding && cmd.keybinding.trim() !== '');
        
        // Get keybindings file paths - do this even if there are no keybindings to add
        // because we still need to clean up existing ones
        let keybindingsUri: vscode.Uri | undefined;
        
        // Try to get the keybindings.json URI
        try {
            keybindingsUri = await getKeybindingsJsonUri();
            if (!keybindingsUri) {
                console.error("Could not locate keybindings.json file");
                return;
            }
        } catch (err) {
            console.error("Error getting keybindings.json URI:", err);
            return;
        }
        
        // Read existing keybindings
        let existingKeybindings: any[] = [];
        let fileContent = "";
        
        try {
            // Read from file system
            const content = await vscode.workspace.fs.readFile(keybindingsUri);
            fileContent = new TextDecoder().decode(content);
            
            // Handle commented file with proper JSON parsing
            if (fileContent.trim().startsWith('//')) {
                // Remove comments at the start of the file
                let jsonStart = fileContent.indexOf('[');
                if (jsonStart === -1) {
                    fileContent = "[]";
                } else {
                    fileContent = fileContent.substring(jsonStart);
                }
            }
            
            existingKeybindings = JSON.parse(fileContent);
            if (!Array.isArray(existingKeybindings)) {
                existingKeybindings = [];
            }
        } catch (err) {
            // If file doesn't exist or is invalid, start with an empty array
            existingKeybindings = [];
        }
        
        // Filter out Terminal Assistant keybindings
        const cleanedKeybindings = existingKeybindings.filter(binding => {
            if (!binding || !binding.command) return true;
            if (typeof binding.command !== 'string') return true;
            return !binding.command.startsWith('terminalAssistant.runCommand.');
        });
        
        // Generate new keybindings array and add them (if any)
        const newKeybindings = commandsWithKeybindings.map(cmd => {
            const commandId = `terminalAssistant.runCommand.${cmd.label.replace(/[^a-zA-Z0-9]/g, '_')}`;
            return {
                key: cmd.keybinding,
                command: commandId,
                when: "editorTextFocus || terminalFocus"
            };
        });
        
        // Add new keybindings
        const updatedKeybindings = [...cleanedKeybindings, ...newKeybindings];
        
        // Format the JSON with proper indentation and handle the comment at the top
        const jsonString = JSON.stringify(updatedKeybindings, null, 2);
        const contentWithComment = `// Place your key bindings in this file to override the defaults\n${jsonString}`;
        
        // Write back to file
        const content = new TextEncoder().encode(contentWithComment);
        await vscode.workspace.fs.writeFile(keybindingsUri, content);
        
        // Show a brief notification about what was done
        if (newKeybindings.length > 0) {
            setTimedStatusBarMessage(
                `Terminal Assistant: Updated ${newKeybindings.length} keyboard shortcuts in keybindings.json`,
                3000
            );
        } else {
            // Only show message when we actually removed shortcuts
            if (existingKeybindings.length !== cleanedKeybindings.length) {
                setTimedStatusBarMessage(
                    `Terminal Assistant: Removed all keyboard shortcuts from keybindings.json`,
                    3000
                );
            }
        }
    } catch (error: unknown) {
        console.error('Error updating shortcuts:', error);
    }
}

// Helper function to get the appropriate keybindings.json file URI
async function getKeybindingsJsonUri(): Promise<vscode.Uri | undefined> {
    const platform = process.platform;
    let settingsFolder: string;
    
    if (platform === 'win32') {
        settingsFolder = process.env.APPDATA || '';
        return vscode.Uri.file(path.join(settingsFolder, 'Code', 'User', 'keybindings.json'));
    } else if (platform === 'darwin') {
        settingsFolder = process.env.HOME || '';
        return vscode.Uri.file(path.join(settingsFolder, 'Library', 'Application Support', 'Code', 'User', 'keybindings.json'));
    } else if (platform === 'linux') {
        settingsFolder = process.env.HOME || '';
        return vscode.Uri.file(path.join(settingsFolder, '.config', 'Code', 'User', 'keybindings.json'));
    }
    
    return undefined;
}

// Add function to setStatusBarMessage with timeout instead of using vscode.window.setStatusBarMessage directly
function setTimedStatusBarMessage(message: string, timeoutMs: number = 3000): void {
    const disposable = vscode.window.setStatusBarMessage(message);
    setTimeout(() => {
        disposable.dispose();
    }, timeoutMs);
}