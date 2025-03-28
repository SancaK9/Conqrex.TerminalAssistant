import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { showTimedInformationMessage, showTimedErrorMessage } from '../utils/notificationUtils';

/**
 * Execute a terminal command with parameter handling
 * @param commandDef The command definition to execute
 */
export async function executeCommand(commandDef: CommandDefinition): Promise<void> {
    try {
        // Get the current active terminal or create a new one
        let terminal = vscode.window.activeTerminal;
        if (!terminal) {
            terminal = vscode.window.createTerminal('Terminal Assistant');
        }
        terminal.show();

        // Send escape key if option is enabled
        if (commandDef.escapeKeyBefore !== false) {
            // Platform-specific escape sequence
            await handleTerminalEscape(terminal);
        }

        // Clear terminal if option is set
        if (commandDef.clearTerminal === true) {
            await handleTerminalEscape(terminal);
            const clearCommand = process.platform === 'win32' ? 'cls' : 'clear';
            terminal.sendText(clearCommand, true);
        }

        // Process the command with parameters
        let finalCommand = commandDef.command;

        if (commandDef.parameters && commandDef.parameters.length > 0) {
            // Get parameter values if not auto-execute
            const paramValues: Record<string, string> = {};

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
                        showTimedInformationMessage('Command execution cancelled', 3000);
                        return;
                    }

                    paramValues[param.name] = value;
                } else {
                    paramValues[param.name] = param.defaultValue;
                }
            }

            // First, handle optional parameters
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

        // Execute the command
        terminal.sendText(finalCommand);

    } catch (error) {
        showTimedErrorMessage(`Error executing command: ${error}`, 5000);
    }

    async function handleTerminalEscape(terminal: vscode.Terminal) {
        if (process.platform === 'win32') {
            terminal.sendText('\u001B', false);
            terminal.sendText('\u001B[2K', false);
            terminal.sendText('\r', false);
        } else {
            terminal.sendText('\u0015', false);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}
