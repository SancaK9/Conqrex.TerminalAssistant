// VSCode webview API
const vscode = acquireVsCodeApi();

// DOM elements
const pinnedCommandsList = document.getElementById('pinnedCommandsList');
const recentCommandsList = document.getElementById('recentCommandsList');
const addCommandBtn = document.getElementById('addCommandBtn');
const quickPickBtn = document.getElementById('quickPickBtn');
const openFullViewBtn = document.getElementById('openFullViewBtn');
const commandCount = document.getElementById('commandCount');

// Initialize the UI
function initializeUI() {
    // Initialize foldable sections
    const foldableHeaders = document.querySelectorAll('.section-header.foldable');
    foldableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('folded');
            // Store folding state in localStorage
            const targetId = header.getAttribute('data-target');
            localStorage.setItem(`fold_${targetId}`, header.classList.contains('folded'));
        });
        
        // Restore folding state
        const targetId = header.getAttribute('data-target');
        if (localStorage.getItem(`fold_${targetId}`) === 'true') {
            header.classList.add('folded');
        }
    });

    // Populate commands
    renderCommandLists();
    
    // Add event listeners to buttons
    addCommandBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'addCommand' });
    });
    
    quickPickBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'quickPick' });
    });
    
    openFullViewBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openCommandsList' });
    });
}

// Render command lists
function renderCommandLists() {
    if (!window.pinnedCommands || window.pinnedCommands.length === 0) {
        pinnedCommandsList.innerHTML = '<div class="empty-list">No pinned commands</div>';
    } else {
        pinnedCommandsList.innerHTML = window.pinnedCommands.map(cmd => createCommandItem(cmd)).join('');
        attachCommandEventListeners(pinnedCommandsList);
    }
    
    if (!window.recentCommands || window.recentCommands.length === 0) {
        recentCommandsList.innerHTML = '<div class="empty-list">No recent commands</div>';
    } else {
        recentCommandsList.innerHTML = window.recentCommands.map(cmd => createCommandItem(cmd)).join('');
        attachCommandEventListeners(recentCommandsList);
    }
    
    // Update count
    if (window.allCommands) {
        commandCount.textContent = `${window.allCommands.length} terminal commands available`;
    }
}

// Create HTML for a command item
function createCommandItem(command) {
    return `
        <div class="command-item" data-command='${JSON.stringify(command)}'>
            <i class="codicon codicon-terminal command-icon"></i>
            <span class="command-label">${command.label || 'Unnamed Command'}</span>
        </div>
    `;
}

// Add event listeners to command items
function attachCommandEventListeners(container) {
    const items = container.querySelectorAll('.command-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            const commandData = JSON.parse(item.getAttribute('data-command'));
            vscode.postMessage({
                type: 'executeCommand',
                command: commandData
            });
        });
    });
}

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    
    if (message.type === 'refreshCommands') {
        window.allCommands = message.commands || [];
        window.pinnedCommands = message.pinnedCommands || [];
        window.recentCommands = message.recentCommands || [];
        renderCommandLists();
    }
});

// Initialize UI when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeUI);
