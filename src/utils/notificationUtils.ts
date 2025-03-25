import * as vscode from 'vscode';

/**
 * Show an information message with an automatic timeout
 * @param message The message to show
 * @param timeoutMs The timeout in milliseconds (default: 3000)
 * @param items Items to include in the notification
 * @returns A promise that resolves to the selected item or undefined
 */
export async function showTimedInformationMessage(
    message: string, 
    timeoutMs: number = 3000, 
    ...items: string[]
): Promise<string | undefined> {
    return new Promise<string | undefined>(resolve => {
        let handled = false;
        
        // Show the notification
        const notification = vscode.window.showInformationMessage(message, ...items);
        
        // Set up timeout to dismiss it
        const timer = setTimeout(() => {
            if (!handled) {
                handled = true;
                resolve(undefined);
            }
        }, timeoutMs);
        
        // Handle user interaction
        notification.then(item => {
            clearTimeout(timer);
            if (!handled) {
                handled = true;
                resolve(item);
            }
        });
    });
}

/**
 * Show an error message with an automatic timeout
 * @param message The message to show
 * @param timeoutMs The timeout in milliseconds (default: 5000)
 * @param items Items to include in the notification
 * @returns A promise that resolves to the selected item or undefined
 */
export async function showTimedErrorMessage(
    message: string, 
    timeoutMs: number = 5000, 
    ...items: string[]
): Promise<string | undefined> {
    return new Promise<string | undefined>(resolve => {
        let handled = false;
        
        // Show the notification
        const notification = vscode.window.showErrorMessage(message, ...items);
        
        // Set up timeout to dismiss it
        const timer = setTimeout(() => {
            if (!handled) {
                handled = true;
                resolve(undefined);
            }
        }, timeoutMs);
        
        // Handle user interaction
        notification.then(item => {
            clearTimeout(timer);
            if (!handled) {
                handled = true;
                resolve(item);
            }
        });
    });
}