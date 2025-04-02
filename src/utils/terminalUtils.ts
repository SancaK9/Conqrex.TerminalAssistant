import * as vscode from 'vscode';
import { showTimedInformationMessage } from './notificationUtils';

// Count of terminals created during this session
let terminalCounter = 0;

/**
 * Find or create a suitable terminal for running commands
 * Avoids using read-only task terminals
 */
export async function findSuitableTerminal(): Promise<vscode.Terminal> {
    // First try to find an existing usable terminal
    const existingTerminal = findFirstUsableTerminal();
    if (existingTerminal) {
        return existingTerminal;
    }
    
    // If no suitable terminal found, create a new one
    return createFreshTerminal();
}

/**
 * Find the first terminal that's not a task terminal and can be used for commands
 * @returns The first usable terminal, or undefined if none found
 */
export function findFirstUsableTerminal(): vscode.Terminal | undefined {
    const terminals = vscode.window.terminals;
    
    // First check if active terminal is usable
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal && !isTaskTerminal(activeTerminal)) {
        return activeTerminal;
    }
    
    // Next, check if we have any Terminal Assistant terminals
    const assistantTerminal = terminals.find(t => 
        t.name.toLowerCase().includes('terminal assistant') && 
        !isTaskTerminal(t)
    );
    
    if (assistantTerminal) {
        return assistantTerminal;
    }
    
    // Last, check for any other non-task terminals
    return terminals.find(t => !isTaskTerminal(t));
}

/**
 * Check if a terminal is likely a task terminal (read-only)
 */
export function isTaskTerminal(terminal: vscode.Terminal): boolean {
    if (!terminal) return false;
    
    const name = terminal.name.toLowerCase();
    
    // Special case: VS Code task terminals always show "Terminal will be reused by tasks"
    // These are the most problematic ones - more aggressive detection
    if ((name.includes('task') && name.includes('dotnet')) || 
        name.startsWith('dotnet:') ||
        name.match(/^task -|^task:|^tasks:/i) ||
        // Additional check for generic task terminals like npm scripts
        name.match(/^terminal-assistant@\d+\.\d+\.\d+/) ||
        name.match(/^npm:|^yarn:|^pnpm:/) ||
        // Match terminal names that include the package name plus version 
        // which is common for npm script execution terminals
        name.match(/^[a-zA-Z0-9_\-\.]+@\d+\.\d+\.\d+/)) {
        return true;
    }
    
    // Check common task-related patterns
    const taskPatterns = [
        'task', 'watch', 'npm', 'yarn', 'pnpm', 'gulp', 'grunt',
        'webpack', 'build', 'debug', 'run ', 'running',
        'jest', 'mocha', 'test', 'serve', 'dotnet', 'compile'
    ];
    
    // If name matches any pattern, consider it a task terminal (but exclude our own terminals)
    return taskPatterns.some(pattern => {
        // Skip if part of "Terminal Assistant"
        if ((pattern === 'task' || pattern === 'run' || pattern === 'compile') && 
            name.includes('terminal assistant')) {
            return false;
        }
        return name.includes(pattern);
    });
}

/**
 * Send escape key sequence to the terminal 
 * to cancel any pending input or clear the line
 */
export async function sendEscapeSequence(terminal: vscode.Terminal): Promise<void> {
    if (!terminal) return;
    
    try {
        // Make sure terminal has focus
        terminal.show(true);
        
        // Send platform-specific escape sequence
        if (process.platform === 'win32') {
            terminal.sendText('\u001B', false); // ESC key
            terminal.sendText('\u001B[2K', false); // Clear line
            terminal.sendText('\r', false); // Carriage return
        } else {
            terminal.sendText('\u0015', false); // CTRL+U to clear line
        }
        
        // Wait a bit for the terminal to process the escape
        await new Promise(resolve => setTimeout(resolve, 150));
    } catch (error) {
        console.warn('Failed to send escape sequence:', error);
        // Don't throw - escape sequence is non-critical
    }
}

/**
 * Clear the terminal content
 */
export async function clearTerminal(terminal: vscode.Terminal): Promise<void> {
    if (!terminal) return;
    
    try {
        // Make sure terminal has focus
        terminal.show(true);
        
        // First cancel any pending command
        await sendEscapeSequence(terminal);
        
        // Send the appropriate clear command based on platform
        const clearCommand = process.platform === 'win32' ? 'cls' : 'clear';
        terminal.sendText(clearCommand, true); // true = Add newline
        
        // Wait for clear command to take effect
        await new Promise(resolve => setTimeout(resolve, 250));
    } catch (error) {
        console.warn('Failed to clear terminal:', error);
        // Don't throw - clearing is non-critical
    }
}

/**
 * Force termination of a "reused by tasks" terminal
 */
export async function forceCloseTaskTerminal(terminal: vscode.Terminal): Promise<boolean> {
    try {
        // First try pressing keys that might dismiss the prompt
        terminal.sendText(' ', false); // Space
        await new Promise(resolve => setTimeout(resolve, 50));
        terminal.sendText('\r', false); // Enter
        await new Promise(resolve => setTimeout(resolve, 50));
        terminal.sendText('\u001B', false); // Escape
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
            // Try to dispose the terminal
            if (terminal.dispose) {
                terminal.dispose();
                return true;
            }
        } catch (err) {
            console.log('Could not dispose terminal, will create a new one instead');
        }
        
        return false;
    } catch (error) {
        console.warn('Failed to force close task terminal:', error);
        return false;
    }
}

/**
 * Create a completely new terminal with progressive numbering
 * This is the most reliable approach when task terminals cause issues
 */
export function createFreshTerminal(): vscode.Terminal {
    // Use a counter to ensure uniqueness
    terminalCounter++;
    
    // Create a uniquely named terminal
    const terminal = vscode.window.createTerminal(`Terminal Assistant #${terminalCounter}`);
    
    // Show the terminal but don't force focus
    terminal.show();
    
    return terminal;
}

/**
 * Reset terminal counter - useful when reloading the extension
 */
export function resetTerminalCounter(): void {
    terminalCounter = 0;
}
