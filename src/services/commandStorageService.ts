import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandDefinition } from '../providers/commandsTreeProvider';
import { showTimedInformationMessage, showTimedErrorMessage } from '../utils/notificationUtils';

export const COMMANDS_FILENAME = 'terminal-commands.json';

export class CommandStorageService {
    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Find or create a commands file based on storage preference
     */
    async findOrCreateCommandsFile(): Promise<string | undefined> {
        // Get storage preference from settings
        const config = vscode.workspace.getConfiguration('terminalAssistant');
        const storagePreference = config.get<string>('storage', 'global');

        // If storage preference is global, always use global storage
        if (storagePreference === 'global') {
            // Use global storage path
            const globalCommandsPath = path.join(this.context.globalStoragePath, COMMANDS_FILENAME);

            // Ensure directory exists
            if (!fs.existsSync(path.dirname(globalCommandsPath))) {
                fs.mkdirSync(path.dirname(globalCommandsPath), { recursive: true });
            }

            // Create the file if it doesn't exist
            if (!fs.existsSync(globalCommandsPath)) {
                try {
                    fs.writeFileSync(globalCommandsPath, JSON.stringify([], null, 2), 'utf8');
                } catch (error) {
                    showTimedErrorMessage(`Failed to create global ${COMMANDS_FILENAME}: ${error}`, 5000);
                    return undefined;
                }
            }

            return globalCommandsPath;
        }

        // Otherwise, prefer workspace storage (existing behavior)

        // Check if we have an active workspace
        if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length === 0) {
            const createGlobal = await showTimedInformationMessage(
                'No workspace folder found. Would you like to use global commands instead?',
                3000,
                'Yes', 'No'
            );

            if (createGlobal === 'Yes') {
                // Use global storage as fallback
                const globalCommandsPath = path.join(this.context.globalStoragePath, COMMANDS_FILENAME);

                // Ensure directory exists
                if (!fs.existsSync(path.dirname(globalCommandsPath))) {
                    fs.mkdirSync(path.dirname(globalCommandsPath), { recursive: true });
                }

                return globalCommandsPath;
            }
            return undefined;
        }

        // Look for the commands file in the workspace folders
        for (const folder of vscode.workspace.workspaceFolders) {
            const possiblePath = path.join(folder.uri.fsPath, COMMANDS_FILENAME);
            if (fs.existsSync(possiblePath)) {
                return possiblePath;
            }
        }

        // If not found, ask if user wants to create one
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const suggestedPath = path.join(workspaceRoot, COMMANDS_FILENAME);

        const createFile = await showTimedInformationMessage(
            `No ${COMMANDS_FILENAME} found in workspace. Would you like to create one?`,
            5000,
            'Yes', 'No'
        );

        if (createFile === 'Yes') {
            // Create a new empty commands file
            try {
                fs.writeFileSync(suggestedPath, JSON.stringify([], null, 2), 'utf8');
                showTimedInformationMessage(`Created ${COMMANDS_FILENAME} in workspace root folder.`, 3000);
                return suggestedPath;
            } catch (error) {
                showTimedErrorMessage(`Failed to create ${COMMANDS_FILENAME}: ${error}`, 5000);
            }
        }

        return undefined;
    }

    /**
     * Load commands from the storage file
     */
    async loadCommands(): Promise<CommandDefinition[]> {
        const commandsPath = await this.findOrCreateCommandsFile();

        if (!commandsPath) {
            return [];
        }

        try {
            const fileContent = fs.readFileSync(commandsPath, 'utf-8');
            const parsedCommands = JSON.parse(fileContent);

            // Add backward compatibility
            return parsedCommands.map((cmd: any) => ({
                ...cmd,
                autoExecute: cmd.hasOwnProperty('autoExecute') ? cmd.autoExecute : true,
                group: cmd.hasOwnProperty('group') ? cmd.group : 'General',
                parameters: cmd.hasOwnProperty('parameters') ? cmd.parameters : undefined
            }));
        } catch (error) {
            showTimedErrorMessage(`Failed to load terminal commands: ${error}`, 5000);
            return [];
        }
    }

    /**
     * Save commands to the storage file
     */
    async saveCommands(commands: CommandDefinition[]): Promise<boolean> {
        const commandsPath = await this.findOrCreateCommandsFile();

        if (!commandsPath) {
            return false;
        }

        try {
            fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2), 'utf-8');
            return true;
        } catch (error) {
            showTimedErrorMessage(`Failed to save terminal commands: ${error}`, 5000);
            return false;
        }
    }

    /**
     * Migrate commands between storage locations
     */
    async migrateCommands(sourceStorage: string, targetStorage: string): Promise<void> {
        try {
            // Save current setting
            const config = vscode.workspace.getConfiguration('terminalAssistant');

            // Temporarily set to source storage to load from there
            await config.update('storage', sourceStorage, vscode.ConfigurationTarget.Global);
            const sourceCommands = await this.loadCommands();

            // Now set to target and save commands there
            await config.update('storage', targetStorage, vscode.ConfigurationTarget.Global);
            const saved = await this.saveCommands(sourceCommands);

            if (saved) {
                showTimedInformationMessage(
                    `Successfully migrated ${sourceCommands.length} commands to ${targetStorage} storage.`,
                    3000
                );
            } else {
                throw new Error('Failed to save commands during migration');
            }
        } catch (error) {
            showTimedErrorMessage(`Failed to migrate commands: ${error}`, 5000);

            // Restore original setting
            const config = vscode.workspace.getConfiguration('terminalAssistant');
            await config.update('storage', sourceStorage, vscode.ConfigurationTarget.Global);
        }
    }
}
