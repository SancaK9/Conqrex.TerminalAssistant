// Terminal Assistant - Minimized Commands View Script
const vscode = acquireVsCodeApi();

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    renderPinnedCommands();
    renderRecentCommands();
    setupEventListeners();
});

// Render pinned commands
function renderPinnedCommands() {
    const pinnedContainer = document.getElementById('pinnedCommandsList');
    
    if (!window.pinnedCommands || window.pinnedCommands.length === 0) {
        pinnedContainer.innerHTML = `<div class="empty-commands">No pinned commands</div>`;
        return;
    }
    
    pinnedContainer.innerHTML = '';
    
    // Limit to 5 items for space
    const displayCommands = window.pinnedCommands.slice(0, 5);
    
    displayCommands.forEach(cmd => {
        const commandItem = document.createElement('div');
        commandItem.className = 'mini-command-item';
        commandItem.title = `${cmd.label}: ${cmd.command}${cmd.description ? `\n${cmd.description}` : ''}`;
        
        commandItem.innerHTML = `
            <div class="mini-command-icon">
                <i class="codicon codicon-terminal"></i>
            </div>
            <div class="mini-command-label">${cmd.label}</div>
        `;
        
        commandItem.addEventListener('click', () => {
            vscode.postMessage({
                type: 'executeCommand',
                command: cmd
            });
        });
        
        pinnedContainer.appendChild(commandItem);
    });
    
    // If we have more than 5 commands, show a "more" indicator
    if (window.pinnedCommands.length > 5) {
        const moreIndicator = document.createElement('div');
        moreIndicator.className = 'mini-command-item';
        moreIndicator.style.fontStyle = 'italic';
        moreIndicator.title = 'Open full view to see all pinned commands';
        
        moreIndicator.innerHTML = `
            <div class="mini-command-icon">
                <i class="codicon codicon-ellipsis"></i>
            </div>
            <div class="mini-command-label">${window.pinnedCommands.length - 5} more...</div>
        `;
        
        moreIndicator.addEventListener('click', () => {
            vscode.postMessage({ type: 'openCommandsList' });
        });
        
        pinnedContainer.appendChild(moreIndicator);
    }
}

// Render recent commands
function renderRecentCommands() {
    const recentContainer = document.getElementById('recentCommandsList');
    
    if (!window.recentCommands || window.recentCommands.length === 0) {
        recentContainer.innerHTML = `<div class="empty-commands">No recent commands</div>`;
        return;
    }
    
    recentContainer.innerHTML = '';
    
    // Limit to 5 items for space
    const displayCommands = window.recentCommands.slice(0, 5);
    
    displayCommands.forEach(cmd => {
        const commandItem = document.createElement('div');
        commandItem.className = 'mini-command-item';
        commandItem.title = `${cmd.label}: ${cmd.command}${cmd.description ? `\n${cmd.description}` : ''}`;
        
        commandItem.innerHTML = `
            <div class="mini-command-icon">
                <i class="codicon codicon-terminal"></i>
            </div>
            <div class="mini-command-label">${cmd.label}</div>
        `;
        
        commandItem.addEventListener('click', () => {
            vscode.postMessage({
                type: 'executeCommand',
                command: cmd
            });
        });
        
        recentContainer.appendChild(commandItem);
    });
    
    // If we have more than 5 commands, show a "more" indicator
    if (window.recentCommands.length > 5) {
        const moreIndicator = document.createElement('div');
        moreIndicator.className = 'mini-command-item';
        moreIndicator.style.fontStyle = 'italic';
        moreIndicator.title = 'Open full view to see all recent commands';
        
        moreIndicator.innerHTML = `
            <div class="mini-command-icon">
                <i class="codicon codicon-ellipsis"></i>
            </div>
            <div class="mini-command-label">${window.recentCommands.length - 5} more...</div>
        `;
        
        moreIndicator.addEventListener('click', () => {
            vscode.postMessage({ type: 'openCommandsList' });
        });
        
        recentContainer.appendChild(moreIndicator);
    }
}

// Set up event listeners
function setupEventListeners() {
    // Add Command button
    document.getElementById('addCommandBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'addCommand' });
    });
    
    // Quick Pick button
    document.getElementById('quickPickBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'quickPick' });
    });
    
    // Open Full View button
    document.getElementById('openFullViewBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'openCommandsList' });
    });
}

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
        case 'refreshCommands':
            // Update stored commands
            window.allCommands = message.commands || [];
            window.pinnedCommands = message.pinnedCommands || [];
            window.recentCommands = message.recentCommands || [];
            
            // Update command count
            const countElement = document.getElementById('commandCount');
            if (countElement) {
                countElement.textContent = `${window.allCommands.length} terminal commands available`;
            }
            
            // Re-render pinned and recent commands
            renderPinnedCommands();
            renderRecentCommands();
            break;
    }
});
