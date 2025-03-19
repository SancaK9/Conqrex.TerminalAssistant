import * as vscode from 'vscode';
import { CommandDefinition } from '../providers/commandsTreeProvider';

/**
 * Generates HTML content for the command editor webview
 * @param webview The webview to generate HTML for
 * @param extensionUri The extension's URI for resource access
 * @param commandToEdit Optional command definition when editing an existing command
 * @param existingGroups Array of existing group names for the dropdown
 * @returns HTML string for the webview content
 */
export function getCommandEditorHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    commandToEdit?: CommandDefinition,
    existingGroups: string[] = []
): string {
    // Use this to access CSS and other resources
    const getWebviewUri = (path: string) => {
        return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', path)).toString();
    };

    // Get the CSS file URI
    const styleUri = getWebviewUri('style.css');

    // Prepare command data for form
    const commandData = commandToEdit ? JSON.stringify(commandToEdit) : 'null';
    const groupsData = JSON.stringify(existingGroups);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${commandToEdit ? 'Edit' : 'Add'} Terminal Command</title>
    <link rel="stylesheet" href="${styleUri}">
    <style>
    /* Critical dialog styles that will work even if the external CSS fails to load */
    .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: none; /* Hidden by default */
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    
    .dialog {
        background-color: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-foreground, #cccccc);
        border-radius: 6px;
        padding: 24px;
        width: 400px;
        max-width: 90%;
        box-shadow: 0 3px 16px rgba(0, 0, 0, 0.3);
        border: 1px solid var(--vscode-panel-border, #555);
        animation: dialogFadeIn 0.2s ease-out;
    }
    
    @keyframes dialogFadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .dialog h3 {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 18px;
        border-bottom: 1px solid var(--vscode-panel-border, #555);
        padding-bottom: 8px;
        color: var(--vscode-editor-foreground, #fff);
    }
    
    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
        gap: 10px;
    }
    
    /* Vertical button layout */
    .dialog-buttons.vertical {
        flex-direction: column;
    }
    
    .dialog-buttons.vertical button {
        width: 100%;
        padding: 10px;
        text-align: center;
    }
    
    /* Ensure input has consistent styling */
    #newGroupName {
        width: 100%;
        padding: 10px;
        background-color: var(--vscode-input-background, #3c3c3c);
        color: var(--vscode-input-foreground, #cccccc);
        border: 1px solid var(--vscode-input-border, #555);
        border-radius: 2px;
        margin-top: 5px;
        font-size: 14px;
    }

    .custom-select-container {
        position: relative;
        width: 100%;
    }

    .custom-select {
        width: 100%;
        appearance: none;
        padding: 8px 10px;
        padding-right: 30px;
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 3px;
        font-size: 14px;
    }

    .custom-select:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
    }

    .select-icon {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
    }

    .group-option-level-0 { padding-left: 8px; font-weight: 500; }
    .group-option-level-1 { padding-left: 24px; }
    .group-option-level-2 { padding-left: 40px; }
    .group-option-level-3 { padding-left: 56px; }

    /* Style for optgroup (parent groups) */
    optgroup {
        font-weight: bold;
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-sideBarSectionHeader-background);
        font-size: 13px;
    }

    /* Custom dropdown tree styles */
    .custom-dropdown-container {
        position: relative;
    }

    .custom-dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 3px;
        font-size: 14px;
        cursor: pointer;
        min-height: 18px;
    }

    .custom-dropdown-header:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
    }

    .dropdown-icon {
        transition: transform 0.2s;
    }

    .dropdown-open .dropdown-icon {
        transform: rotate(180deg);
    }

    .custom-dropdown-content {
        display: none;
        position: absolute;
        width: 100%;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 3px;
        margin-top: 4px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 100;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }

    .dropdown-search {
        padding: 8px;
        border-bottom: 1px solid var(--vscode-panel-border);
    }

    #group-search {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid var(--vscode-input-border);
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 3px;
    }

    .dropdown-tree {
        padding: 5px 0;
    }

    .tree-item {
        display: flex;
        align-items: center;
        padding: 6px 10px;
        cursor: pointer;
        transition: background 0.1s;
        position: relative;
    }

    .tree-item:hover {
        background: var(--vscode-list-hoverBackground);
    }

    .tree-item.selected {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
    }

    .tree-item-indent {
        width: 16px;
        height: 100%;
        flex-shrink: 0;
        display: inline-block;
        text-align: center;
        font-family: monospace;
        font-size: 14px;
        color: var(--vscode-panel-border);
        line-height: 1;
        padding-top: 2px;
    }
</style>
</head>
<body>
    <div class="form-container">
        <h2>${commandToEdit ? 'Edit Terminal Command' : 'Create New Terminal Command'}</h2>
        
        <div class="form-group">
            <label for="label">Command Name:</label>
            <input type="text" id="label" placeholder="Enter a name for this command" required>
            <div class="help-text">A short, descriptive name for the command</div>
        </div>
        
        <div class="form-group">
            <label for="command">Command:</label>
            <textarea id="command" placeholder="Enter the terminal command" required></textarea>
            <div class="help-text">Use {parameter} syntax to define parameters (e.g., dotnet add package {packageName} {version})</div>
        </div>
        
        <div class="form-group">
            <label for="description">Description:</label>
            <textarea id="description" placeholder="Enter an optional description"></textarea>
        </div>
        
        <div class="form-group">
    <label for="group-display">Group:</label>
    <div style="display: flex; gap: 10px;">
        <div class="custom-dropdown-container" style="flex-grow: 1;">
            <div class="custom-dropdown-header" id="selected-group-display">
                <span id="selected-group-text">-- Select a group --</span>
                <i class="codicon codicon-chevron-down dropdown-icon"></i>
            </div>
            <input type="hidden" id="group" value="">
            <div class="custom-dropdown-content" id="group-dropdown-content">
                <div class="dropdown-search">
                    <input type="text" id="group-search" placeholder="Search groups...">
                </div>
                <div class="dropdown-tree" id="group-tree"></div>
            </div>
        </div>
        <button id="addGroupBtn" class="secondary" type="button">New Group</button>
    </div>
    <div class="help-text">You can use '/' to create nested groups (e.g., "Development/Frontend")</div>
</div>
        
        <div class="checkbox-container">
            <input type="checkbox" id="autoExecute">
            <label for="autoExecute">Auto-execute this command (run immediately when selected)</label>
        </div>
        
        <div class="form-group">
            <label>Parameters:</label>
            <div class="parameters-section">
                <div class="parameters-header">
                    <span id="parameters-title">Detected Parameters</span>
                    <span id="parameters-count">(0)</span>
                </div>
                <div id="parameters-container">
                    <!-- Parameters will be added here dynamically -->
                </div>
                <div class="help-text">Parameters are automatically detected from the command using the {parameter} syntax</div>
            </div>
        </div>
        
        <div class="button-container">
            <button class="secondary" id="cancelBtn" type="button">Cancel</button>
            <button class="primary" id="saveBtn" type="button">Save Command</button>
        </div>
    </div>
    
    <!-- Custom Dialog for New Group -->
<div class="dialog-overlay" id="groupDialogOverlay">
    <div class="dialog">
        <div class="dialog-content vertical">
            <h3>Create New Group</h3>
            <div class="form-group">
                <label for="newGroupName">Group Name:</label>
                <input type="text" id="newGroupName" placeholder="Enter group name">
            </div>
            <div class="dialog-buttons vertical">
                <button class="primary" id="createGroupBtn" type="button">Create Group</button>
                <button class="secondary" id="cancelGroupBtn" type="button">Cancel</button>
            </div>
        </div>
    </div>
</div>

    <script>
        // Initialize with data
        const commandToEdit = ${commandData};
        const existingGroups = ${groupsData};
        const vscode = acquireVsCodeApi();
        
        // Populate the form with existing data if editing
        function initializeForm() {
    // Initialize the custom dropdown for groups
    initializeDropdownTree();
    
    if (commandToEdit) {
        // Fill form with existing command data
        document.getElementById('label').value = commandToEdit.label || '';
        document.getElementById('command').value = commandToEdit.command || '';
        document.getElementById('description').value = commandToEdit.description || '';
        document.getElementById('autoExecute').checked = commandToEdit.autoExecute || false;
        
        // Update parameters
        updateParametersFromCommand();
    }
}
        
        // Extract and display parameters from the command string
        function updateParametersFromCommand() {
    const commandText = document.getElementById('command').value;
    const paramRegex = /\{([^{}]+)\}/g;
    const matches = [...commandText.matchAll(paramRegex)];
    const uniqueParams = [];
    
    // Get current parameter inputs to preserve user edits
    const currentParams = {};
    document.querySelectorAll('.parameter-item').forEach(item => {
        const paramName = item.dataset.param;
        const description = item.querySelector('.param-description')?.value || '';
        const defaultValue = item.querySelector('.param-default')?.value || '';
        
        currentParams[paramName] = {
            description,
            defaultValue
        };
    });
    
    // Extract unique parameter names
    matches.forEach(match => {
        const paramName = match[1];
        if (!uniqueParams.some(p => p.name === paramName)) {
            // Check three possible sources for parameter data in priority order:
            // 1. Current form values (to preserve user edits)
            // 2. Original command being edited
            // 3. Default empty values
            
            // First check if we have this parameter in the form already
            if (currentParams[paramName]) {
                uniqueParams.push({
                    name: paramName,
                    description: currentParams[paramName].description,
                    defaultValue: currentParams[paramName].defaultValue
                });
            }
            // Then check if it exists in the command being edited
            else {
                const existingParam = commandToEdit && commandToEdit.parameters ? 
                    commandToEdit.parameters.find(p => p.name === paramName) : null;
                
                uniqueParams.push({
                    name: paramName,
                    description: existingParam ? existingParam.description : '',
                    defaultValue: existingParam ? existingParam.defaultValue : ''
                });
            }
        }
    });
    
    // Update UI
    const container = document.getElementById('parameters-container');
    container.innerHTML = '';
    document.getElementById('parameters-count').textContent = "(" + uniqueParams.length + ")";
    
    if (uniqueParams.length === 0) {
        container.innerHTML = '<div class="help-text">No parameters detected. Use {paramName} in your command to add parameters.</div>';
        return;
    }
    
    // Create UI for each parameter
    uniqueParams.forEach((param, index) => {
        const paramItem = document.createElement('div');
        paramItem.className = 'parameter-item';
        paramItem.dataset.param = param.name;
        
        paramItem.innerHTML = \`
        <div class="form-group">
            <label>Parameter Name:</label>
            <input type="text" class="param-name" value="\${param.name}" readonly>
        </div>
        <div class="form-group">
            <label>Description:</label>
            <input type="text" class="param-description" value="\${param.description || ''}" placeholder="Description for this parameter">
        </div>
        <div class="form-group">
            <label>Default Value:</label>
            <input type="text" class="param-default" value="\${param.defaultValue || ''}" placeholder="Default value">
        </div>
        \`;
        
        container.appendChild(paramItem);
    });
}
        
        // Function to show custom dialog
        function showGroupDialog() {
            console.log('Opening new group dialog');
            const overlay = document.getElementById('groupDialogOverlay');
            overlay.style.display = 'flex';
            
            // Focus the input after a small delay to ensure the dialog is visible
            setTimeout(() => {
                const input = document.getElementById('newGroupName');
                if (input) {
                    input.focus();
                    input.value = '';  // Clear any previous value
                }
            }, 50);
        }
        
        // Function to hide custom dialog
        function hideGroupDialog() {
            console.log('Closing dialog');
            document.getElementById('groupDialogOverlay').style.display = 'none';
        }
        
        // Function to handle adding a new group
        function addNewGroup() {
            showGroupDialog();
        }
        
        // Function to create a new group from dialog input
        function createNewGroup() {
    const newGroup = document.getElementById('newGroupName').value.trim();
    
    if (newGroup) {
        // Add the new group to hidden input
        const hiddenInput = document.getElementById('group');
        const displayText = document.getElementById('selected-group-text');
        
        hiddenInput.value = newGroup;
        
        // Format display text for nested groups to show full hierarchy
        if (newGroup.includes('/')) {
            const segments = newGroup.split('/');
            const lastSegment = segments.pop();
            displayText.textContent = lastSegment;
            
            // Create tooltip showing full path
            displayText.title = newGroup;
            
            // Add nested indicator
            const nestedIndicator = document.createElement('span');
            nestedIndicator.className = 'nested-path';
            nestedIndicator.textContent = \` (in \${segments.join('/')})\`;
            nestedIndicator.style.fontSize = '0.9em';
            nestedIndicator.style.opacity = '0.8';
            
            // Clear any existing indicator
            while (displayText.nextSibling) {
                displayText.parentNode.removeChild(displayText.nextSibling);
            }
            
            displayText.parentNode.appendChild(nestedIndicator);
        } else {
            displayText.textContent = newGroup;
            displayText.title = newGroup;
            
            // Clear any existing indicator
            while (displayText.nextSibling) {
                displayText.parentNode.removeChild(displayText.nextSibling);
            }
        }
        
        // Hide dialog
        hideGroupDialog();
    } else {
        alert('Please enter a valid group name');
    }
}
        
        // Function to save the command
        function saveCommand() {
            // Validate form
            const label = document.getElementById('label').value.trim();
            const command = document.getElementById('command').value.trim();
            const description = document.getElementById('description').value.trim();
            const group = document.getElementById('group').value;
            const autoExecute = document.getElementById('autoExecute').checked;
            
            if (!label) {
                alert('Please enter a command name');
                return;
            }
            
            if (!command) {
                alert('Please enter a command');
                return;
            }
            
            if (!group) {
                alert('Please select or create a group');
                return;
            }
            
            // Collect parameters
            const parameters = [];
            const paramItems = document.querySelectorAll('.parameter-item');
            paramItems.forEach(item => {
                const name = item.dataset.param;
                const description = item.querySelector('.param-description').value.trim();
                const defaultValue = item.querySelector('.param-default').value.trim();
                
                parameters.push({
                    name,
                    description: description || undefined,
                    defaultValue: defaultValue || undefined
                });
            });
            
            // Create command object
            const commandData = {
                label,
                command,
                description: description || undefined,
                autoExecute,
                group,
                parameters: parameters.length > 0 ? parameters : undefined
            };
            
            // Send to extension
            vscode.postMessage({
                command: 'saveCommand',
                commandData
            });
        }
        
        // Set up event listeners
        function setupEventListeners() {
            // Main form buttons
            document.getElementById('addGroupBtn').addEventListener('click', addNewGroup);
            document.getElementById('command').addEventListener('input', updateParametersFromCommand);
            document.getElementById('cancelBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'cancel' });
            });
            document.getElementById('saveBtn').addEventListener('click', saveCommand);
            
            // Group dialog buttons
            document.getElementById('cancelGroupBtn').addEventListener('click', hideGroupDialog);
            document.getElementById('createGroupBtn').addEventListener('click', createNewGroup);
            
            // Allow Enter key to submit the dialog
            document.getElementById('newGroupName').addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    createNewGroup();
                } else if (event.key === 'Escape') {
                    hideGroupDialog();
                }
            });
            
            // Close dialog when clicking outside
            document.getElementById('groupDialogOverlay').addEventListener('click', (event) => {
                if (event.target === document.getElementById('groupDialogOverlay')) {
                    hideGroupDialog();
                }
            });
        }
        
        // Initialize when the document is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initializeForm();
                setupEventListeners();
            });
        } else {
            // DOM already loaded, initialize immediately
            initializeForm();
            setupEventListeners();
        }

        // Populate groups dropdown - new tree-based implementation
function initializeDropdownTree() {
    // Get references to DOM elements
    const dropdownHeader = document.getElementById('selected-group-display');
    const dropdownContent = document.getElementById('group-dropdown-content');
    const selectedGroupText = document.getElementById('selected-group-text');
    const hiddenInput = document.getElementById('group');
    const treeContainer = document.getElementById('group-tree');
    const searchInput = document.getElementById('group-search');
    
    // Sort groups to create hierarchy
    const sortedGroups = [...existingGroups].sort();
    
    // Function to build tree structure from flat path list
    function buildGroupTree(groups) {
        // Build tree structure
        const tree = {};
        
        groups.forEach(path => {
            const segments = path.split('/');
            let currentLevel = tree;
            
            segments.forEach((segment, index) => {
                if (!currentLevel[segment]) {
                    currentLevel[segment] = {
                        children: {},
                        path: segments.slice(0, index + 1).join('/')
                    };
                }
                currentLevel = currentLevel[segment].children;
            });
        });
        
        return tree;
    }
    
    // Function to render tree view
    function renderTree(tree, container, level = 0, isLastGroup = []) {
        // Add a "Select a group" option at the top level only
        if (level === 0) {
            const defaultItem = document.createElement('div');
            defaultItem.className = 'tree-item';
            defaultItem.dataset.value = '';
            defaultItem.innerHTML = '<span>-- Select a group --</span>';
            defaultItem.addEventListener('click', () => selectGroup('', '-- Select a group --'));
            container.appendChild(defaultItem);
            
            // Add "General" if no groups exist
            if (existingGroups.length === 0) {
                const generalItem = document.createElement('div');
                generalItem.className = 'tree-item';
                generalItem.dataset.value = 'General';
                generalItem.innerHTML = '<span>General</span>';
                generalItem.addEventListener('click', () => selectGroup('General', 'General'));
                container.appendChild(generalItem);
                return;
            }
        }
        
        // Get sorted keys for consistent ordering
        const keys = Object.keys(tree).sort((a, b) => {
            // If one has children and the other doesn't, put parent groups first
            const aHasChildren = Object.keys(tree[a].children).length > 0;
            const bHasChildren = Object.keys(tree[b].children).length > 0;
            if (aHasChildren !== bHasChildren) {
                return aHasChildren ? -1 : 1;
            }
            // Otherwise sort alphabetically
            return a.localeCompare(b);
        });
        
        keys.forEach((key, index) => {
            const node = tree[key];
            const isLast = index === keys.length - 1;
            const currentIsLast = [...isLastGroup, isLast];
            
            // Create tree item
            const item = document.createElement('div');
            item.className = 'tree-item';
            item.dataset.value = node.path;
            item.dataset.level = level.toString();
            
            // Indentation and styling
            let innerHtml = '';
            
            // Add indentation and branch lines for hierarchy visualization
            for (let i = 0; i < level; i++) {
                if (i === level - 1) {
                    // Last level gets either a corner or tee character
                    const branchChar = isLast ? '└' : '├';
                    innerHtml += \`<span class="tree-item-indent">\${branchChar}─</span>\`;
                } else {
                    // Other levels get either a vertical line or space
                    innerHtml += \`<span class="tree-item-indent">\${!isLastGroup[i] ? '│' : ' '}</span>\`;
                }
            }
            
            // Icon based on whether this is a parent or leaf node
            const hasChildren = Object.keys(node.children).length > 0;
            const icon = hasChildren ? 'folder' : 'symbol-field';
            
            innerHtml += \`<i class="codicon codicon-\${icon} tree-item-icon"></i><span>\${key}</span>\`;
            item.innerHTML = innerHtml;
            
            // Click handler to select this group
            item.addEventListener('click', () => selectGroup(node.path, key));
            
            container.appendChild(item);
            
            // Recursively render children
            if (hasChildren) {
                renderTree(node.children, container, level + 1, currentIsLast);
            }
        });
    }
    
    // Function to select a group
    function selectGroup(value, displayText) {
        hiddenInput.value = value;
        
        // Enhance the display text for nested groups
        if (value && value.includes('/')) {
            const segments = value.split('/');
            const lastSegment = segments.pop();
            selectedGroupText.textContent = lastSegment;
            selectedGroupText.title = value;
            
            // Add nested indicator with consistent styling
            const nestedIndicator = document.createElement('span');
            nestedIndicator.className = 'nested-path';
            nestedIndicator.textContent = \` (in \${segments.join('/')})\`;
            nestedIndicator.style.fontSize = '0.9em';
            nestedIndicator.style.opacity = '0.8';
            
            // Clear any existing indicator
            while (selectedGroupText.nextSibling) {
                selectedGroupText.parentNode.removeChild(selectedGroupText.nextSibling);
            }
            
            selectedGroupText.parentNode.appendChild(nestedIndicator);
        } else {
            selectedGroupText.textContent = value || displayText;
            selectedGroupText.title = value || '';
            
            // Clear any existing indicator
            while (selectedGroupText.nextSibling) {
                selectedGroupText.parentNode.removeChild(selectedGroupText.nextSibling);
            }
        }
        
        // Mark the selected item
        const items = treeContainer.querySelectorAll('.tree-item');
        items.forEach(item => {
            if (item.dataset.value === value) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // Close the dropdown
        dropdownContent.style.display = 'none';
        dropdownHeader.classList.remove('dropdown-open');
        
        // If editing, update the command data
        if (commandToEdit) {
            commandToEdit.group = value;
        }
    }
    
    // Function to filter tree items based on search
    function filterTree(searchText) {
        const items = treeContainer.querySelectorAll('.tree-item');
        const lowerSearch = searchText.toLowerCase();
        
        if (!searchText) {
            // Show all items if no search text
            items.forEach(item => item.style.display = '');
            return;
        }
        
        items.forEach(item => {
            const groupPath = item.dataset.value;
            if (!groupPath) {
                // Always show the "Select a group" option
                item.style.display = '';
                return;
            }
            
            if (groupPath.toLowerCase().includes(lowerSearch)) {
                item.style.display = '';
                
                // Show parent items if child matches
                let currentLevel = parseInt(item.dataset.level || '0');
                let prevSibling = item.previousElementSibling;
                
                while (prevSibling) {
                    const siblingLevel = parseInt(prevSibling.dataset.level || '0');
                    if (siblingLevel < currentLevel) {
                        prevSibling.style.display = '';
                        currentLevel = siblingLevel;
                    }
                    prevSibling = prevSibling.previousElementSibling;
                }
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    // Build and render the tree
    const groupTree = buildGroupTree(sortedGroups);
    renderTree(groupTree, treeContainer);
    
    // Toggle dropdown visibility
    dropdownHeader.addEventListener('click', () => {
        const isVisible = dropdownContent.style.display === 'block';
        dropdownContent.style.display = isVisible ? 'none' : 'block';
        dropdownHeader.classList.toggle('dropdown-open', !isVisible);
        
        if (!isVisible) {
            // Clear search when opening
            searchInput.value = '';
            filterTree('');
            searchInput.focus();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdownHeader.contains(e.target) && !dropdownContent.contains(e.target)) {
            dropdownContent.style.display = 'none';
            dropdownHeader.classList.remove('dropdown-open');
        }
    });
    
    // Handle search input
    searchInput.addEventListener('input', () => {
        filterTree(searchInput.value);
    });
    
    // Handle keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdownContent.style.display = 'none';
            dropdownHeader.classList.remove('dropdown-open');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const visibleItems = [...treeContainer.querySelectorAll('.tree-item')]
                .filter(item => item.style.display !== 'none');
            if (visibleItems.length > 0) {
                visibleItems[0].focus();
            }
        }
    });
    
    // Set initial value if editing
    if (commandToEdit && commandToEdit.group) {
        const groupPath = commandToEdit.group;
        const lastSegment = groupPath.split('/').pop();
        selectGroup(groupPath, lastSegment);
    }
}
    </script>
</body>
</html>`;
}