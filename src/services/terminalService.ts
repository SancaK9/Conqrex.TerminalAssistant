import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { showTimedInformationMessage, showTimedErrorMessage } from '../utils/notificationUtils';
import { createFreshTerminal, isTaskTerminal, sendEscapeSequence, findFirstUsableTerminal } from '../utils/terminalUtils';

// Keep track of terminals we've created
let lastCreatedTerminal: vscode.Terminal | undefined = undefined;
let dedicatedTerminal: vscode.Terminal | undefined = undefined;

/**
 * Execute a terminal command with parameter handling
 * @param commandDef The command definition to execute
 */
export async function executeCommand(commandDef: CommandDefinition): Promise<void> {
    try {
        // Get terminal mode from configuration
        const config = vscode.workspace.getConfiguration('terminalAssistant');
        const terminalMode = config.get<string>('terminalMode', 'reuseExisting');
        
        let terminal: vscode.Terminal | undefined;
        let isNewTerminal = false;
        
        // Get the right terminal based on configuration
        if (terminalMode === 'alwaysNew') {
            // Always create a new terminal
            terminal = createFreshTerminal();
            lastCreatedTerminal = terminal;
            isNewTerminal = true;
        } else {
            // Smart reuse or standard reuse - get appropriate terminal
            terminal = await getAppropriateTerminal(terminalMode === 'smartReuse');
            
            // Check if this is a new terminal
            if (terminal && (!vscode.window.activeTerminal || terminal.name !== vscode.window.activeTerminal.name)) {
                isNewTerminal = true;
            }
        }
        
        if (!terminal) {
            throw new Error('Could not get or create a terminal');
        }
        
        // Show the terminal, preserve focus
        terminal.show(true);
        
        // Give extra time for new terminals to initialize
        if (isNewTerminal) {
            await new Promise(resolve => setTimeout(resolve, 500));
        } else {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Process the command with parameters
        let finalCommand = commandDef.command;

        if (commandDef.parameters && commandDef.parameters.length > 0) {
            // Get parameter values if not auto-execute
            const paramValues: Record<string, string> = {};

            // Handle parameters
            for (const param of commandDef.parameters) {
                if (!commandDef.autoExecute || !param.defaultValue) {
                    const placeholder = param.description || `Enter value for ${param.name}`;
                    const promptText = param.defaultValue
                        ? `${placeholder} (default: ${param.defaultValue})`
                        : placeholder;

                    const optionalInfo = param.optional ? ' (optional)' : '';
                    const finalPrompt = promptText + optionalInfo;

                    const value = await vscode.window.showInputBox({
                        prompt: finalPrompt,
                        placeHolder: param.name,
                        value: param.defaultValue
                    });

                    if (value === undefined) {
                        showTimedInformationMessage('Command execution cancelled', 2000);
                        return;
                    }

                    paramValues[param.name] = value;
                } else {
                    paramValues[param.name] = param.defaultValue;
                }
            }

            // Handle optional parameters
            for (const param of commandDef.parameters) {
                const paramName = param.name;
                const paramValue = paramValues[paramName];

                // If parameter is optional and empty, try to remove the associated flag
                if (param.optional && (!paramValue || paramValue.trim() === '')) {
                    // Common flag patterns to look for and remove
                    const patterns = [
                        // Unix/Linux style flags
                        // --flag {param}
                        new RegExp(`\\s*--\\S+\\s+\\{${paramName}\\}\\s*`, 'g'),

                        // --flag={param}
                        new RegExp(`\\s*--\\S+=\\{${paramName}\\}\\s*`, 'g'),

                        // -f {param} (single letter flag)
                        new RegExp(`\\s*-\\S\\s+\\{${paramName}\\}\\s*`, 'g'),

                        // Windows CMD style
                        // /flag {param}
                        new RegExp(`\\s*\\/\\S+\\s+\\{${paramName}\\}\\s*`, 'g'),

                        // PowerShell style
                        // -Flag:{param}
                        new RegExp(`\\s*-\\S+:\\{${paramName}\\}\\s*`, 'g'),

                        // Java/Maven style
                        // -Dflag={param}
                        new RegExp(`\\s*-D\\S+=\\{${paramName}\\}\\s*`, 'g'),

                        // Docker style
                        // --flag={param}:{otherValue}
                        new RegExp(`\\s*--\\S+=\\{${paramName}\\}:[^\\s]+\\s*`, 'g'),

                        // Double dash separator with parameter
                        // -- {param}
                        new RegExp(`\\s*--\\s+\\{${paramName}\\}\\s*`, 'g'),

                        // Any remaining standalone parameters without flags
                        new RegExp(`\\s*\\{${paramName}\\}\\s*`, 'g')
                    ];

                    // Try each pattern
                    for (const pattern of patterns) {
                        finalCommand = finalCommand.replace(pattern, ' ');
                    }
                }
            }

            // Then replace all remaining parameters
            for (const [name, value] of Object.entries(paramValues)) {
                const regex = new RegExp(`\\{${name}\\}`, 'g');
                finalCommand = finalCommand.replace(regex, value);
            }

            // Clean up any extra spaces
            finalCommand = finalCommand.replace(/\s+/g, ' ').trim();
        }

        // For existing terminals, clear line first if needed
        if (!isNewTerminal && commandDef.escapeKeyBefore !== false) {
            await sendEscapeSequence(terminal);
        }
        
        // Clear terminal if option is set
        if (commandDef.clearTerminal === true) {
            const clearCommand = process.platform === 'win32' ? 'cls' : 'clear';
            terminal.sendText(clearCommand, true);
            
            // Wait for clear command to take effect
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Execute the command
        terminal.sendText(finalCommand);
        
        // Log success but don't show visual notification (it's clear the command ran)
        console.log(`Command "${commandDef.label}" executed in terminal ${terminal.name}`);
        
        return;
    } catch (error) {
        // Handle general errors
        showTimedErrorMessage(`Error with terminal: ${error instanceof Error ? error.message : String(error)}`, 5000);
        console.error('Terminal command operation failed:', error);
    }
}

/**
 * Get an appropriate terminal for command execution based on the current state
 * @param smartMode If true, uses more advanced logic to determine if a new terminal is needed
 */
async function getAppropriateTerminal(smartMode: boolean): Promise<vscode.Terminal> {
    // Try to find any existing usable terminals first (non-task terminals)
    // This is more efficient than always creating new ones
    const existingTerminal = findFirstUsableTerminal();
    
    // If we found a usable non-task terminal, use it and don't create a new one
    if (existingTerminal) {
        return existingTerminal;
    }
    
    // Get the current active terminal
    const activeTerminal = vscode.window.activeTerminal;
    
    // Check if we have a dedicated terminal and it's still valid
    if (dedicatedTerminal) {
        try {
            // Check if the dedicated terminal is still in the list of terminals
            const exists = vscode.window.terminals.some(t => t === dedicatedTerminal);
            if (!exists) {
                dedicatedTerminal = undefined;
            }
        } catch {
            dedicatedTerminal = undefined;
        }
    }
    
    // In smart mode, we need to check if the active terminal is suitable
    if (smartMode) {
        if (activeTerminal && !isTaskTerminal(activeTerminal)) {
            // Active terminal is fine, use it
            return activeTerminal;
        } else {
            // No suitable active terminal, use dedicated or create one
            if (dedicatedTerminal) {
                return dedicatedTerminal;
            }
            
            // Create a dedicated terminal for our commands
            dedicatedTerminal = createFreshTerminal();
            return dedicatedTerminal;
        }
    } else {
        // Standard reuse mode - try active terminal, last created terminal, or create new
        if (activeTerminal && !isTaskTerminal(activeTerminal)) {
            return activeTerminal;
        } else if (dedicatedTerminal) {
            return dedicatedTerminal;
        } else {
            // Create a new terminal and set as dedicated
            dedicatedTerminal = createFreshTerminal();
            return dedicatedTerminal;
        }
    }
}

/**
 * Get the last created terminal (if any)
 */
export function getLastCreatedTerminal(): vscode.Terminal | undefined {
    return lastCreatedTerminal;
}

/**
 * Get the dedicated terminal for commands (if any)
 */
export function getDedicatedTerminal(): vscode.Terminal | undefined {
    return dedicatedTerminal;
}

/**
 * Set the dedicated terminal for commands
 * @param terminal Terminal to use for future commands
 */
export function setDedicatedTerminal(terminal: vscode.Terminal | undefined): void {
    dedicatedTerminal = terminal;
}
