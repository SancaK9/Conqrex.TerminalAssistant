// Access VSCode API
const vscode = acquireVsCodeApi();

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    setupEventListeners();
});

// Initialize form fields
function initializeForm() {
    // Initialize the custom dropdown for groups
    initializeDropdownTree();
    
    if (window.commandToEdit) {
        // Fill form with existing command data
        document.getElementById('label').value = window.commandToEdit.label || '';
        document.getElementById('command').value = window.commandToEdit.command || '';
        document.getElementById('description').value = window.commandToEdit.description || '';
        document.getElementById('autoExecute').checked = window.commandToEdit.autoExecute || false;
        
        // Set the clear terminal checkbox (default to true if not specified)
        document.getElementById('clearTerminal').checked = 
            window.commandToEdit.clearTerminal === undefined ? true : window.commandToEdit.clearTerminal || false;
        
        // Set the escape key checkbox
        document.getElementById('escapeKeyBefore').checked = window.commandToEdit.escapeKeyBefore || false;
        
        // Initialize keybinding if present
        if (window.commandToEdit && window.commandToEdit.keybinding) {
            document.getElementById('keybinding').value = window.commandToEdit.keybinding;
        }
        
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
        const optional = item.querySelector('.param-optional')?.checked || false;
        
        currentParams[paramName] = {
            description,
            defaultValue,
            optional
        };
    });
    
    // Extract unique parameter names
    matches.forEach(match => {
        const paramName = match[1];
        if (!uniqueParams.some(p => p.name === paramName)) {
            // First check if we have this parameter in the form already
            if (currentParams[paramName]) {
                uniqueParams.push({
                    name: paramName,
                    description: currentParams[paramName].description,
                    defaultValue: currentParams[paramName].defaultValue,
                    optional: currentParams[paramName].optional
                });
            }
            // Then check if it exists in the command being edited
            else {
                const existingParam = window.commandToEdit && window.commandToEdit.parameters ? 
                    window.commandToEdit.parameters.find(p => p.name === paramName) : null;
                
                uniqueParams.push({
                    name: paramName,
                    description: existingParam ? existingParam.description : '',
                    defaultValue: existingParam ? existingParam.defaultValue : '',
                    optional: existingParam ? existingParam.optional : false
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
    uniqueParams.forEach(createParameterItem);
}

function createParameterItem(param) {
    const commandText = document.getElementById('command').value;
    const container = document.getElementById('parameters-container');
    
    const paramItem = document.createElement('div');
    paramItem.className = 'parameter-item';
    paramItem.dataset.param = param.name;
    
    // Check if this parameter is associated with a flag
    const hasFlag = [
        new RegExp(`--\\S+\\s+\\{${param.name}\\}`),
        new RegExp(`--\\S+=\\{${param.name}\\}`),
        new RegExp(`-\\S\\s+\\{${param.name}\\}`),
        new RegExp(`\\/\\S+\\s+\\{${param.name}\\}`),
        new RegExp(`-\\S+:\\{${param.name}\\}`),
        new RegExp(`-D\\S+=\\{${param.name}\\}`),
        new RegExp(`--\\S+=\\{${param.name}\\}:[^\\s]+`),
        new RegExp(`--\\s+\\{${param.name}\\}`)
    ].some(pattern => pattern.test(commandText));
    
    // Build the parameter item HTML
    let paramHtml = `
        <div class="form-group">
            <label>Parameter Name:</label>
            <input type="text" class="param-name" value="${param.name}" readonly>
        </div>
        <div class="form-group">
            <label>Description:</label>
            <input type="text" class="param-description" value="${param.description || ''}" placeholder="Description for this parameter">
        </div>
        <div class="form-group">
            <label>Default Value:</label>
            <input type="text" class="param-default" value="${param.defaultValue || ''}" placeholder="Default value">
        </div>
    `;
    
    // Only show optional checkbox for parameters with flags
    if (hasFlag) {
        paramHtml += createFlagOptionsHtml(param, commandText);
    }
    
    paramItem.innerHTML = paramHtml;
    container.appendChild(paramItem);
}

function createFlagOptionsHtml(param, commandText) {
    // Create the optional checkbox and help text for flag parameters
    return `
        <div class="checkbox-container">
            <input type="checkbox" class="param-optional" id="optional-${param.name}" ${param.optional ? 'checked' : ''}>
            <label for="optional-${param.name}">Remove flag when empty</label>
        </div>
        <div class="help-text" style="border-left: 3px solid var(--vscode-focusBorder); padding-left: 8px; margin: 4px 0 10px 0;">
            <div style="font-size: 11px; opacity: 0.9; margin-bottom: 6px;">If <strong>${param.name}</strong> is empty:</div>
            <div style="display: grid; grid-template-columns: 20px 1fr; gap: 6px; align-items: start;">
                <span style="color: var(--vscode-gitDecoration-addedResourceForeground); font-size: 13px; grid-row: 1;">✓</span>
                <div style="grid-row: 1;">
                    <div style="font-size: 11px; margin-bottom: 3px;"><strong>With checkbox:</strong> Flag and parameter removed</div>
                    <code style="background: var(--vscode-textCodeBlock-background); padding: 3px 6px; border-radius: 3px; display: block; font-size: 12px; word-break: break-all; white-space: normal; line-height: 1.4;">
                        ${createFlagExampleHtml(param, commandText)}
                    </code>
                </div>
                <span style="color: var(--vscode-errorForeground); font-size: 13px; grid-row: 2;">✗</span>
                <div style="grid-row: 2;">
                    <div style="font-size: 11px; margin-bottom: 3px;"><strong>Without checkbox:</strong> Flag remains, parameter empty</div>
                    <code style="background: var(--vscode-textCodeBlock-background); padding: 3px 6px; border-radius: 3px; display: block; font-size: 12px; word-break: break-all; white-space: normal; line-height: 1.4; position: relative;">
                        ${commandText.replace(
                            new RegExp(`\\{${param.name}\\}`, 'g'),
                            '<span style="color: var(--vscode-errorForeground); font-style: italic;" title="Empty parameter">empty</span>'
                        )}
                    </code>
                </div>
            </div>
        </div>
    `;
}

function createFlagExampleHtml(param, commandText) {
    // Original command with this parameter's flag+value highlighted
    let highlighted = commandText.replace(
        new RegExp(`(--\\S+\\s+\\{${param.name}\\}|--\\S+=\\{${param.name}\\}|-\\S\\s+\\{${param.name}\\}|\\/\\S+\\s+\\{${param.name}\\}|-\\S+:\\{${param.name}\\}|-D\\S+=\\{${param.name}\\}|--\\S+=\\{${param.name}\\}:[^\\s]+|--\\s+\\{${param.name}\\})`, 'g'), 
        '<span style="text-decoration: line-through; background-color: rgba(255,0,0,0.2); padding: 0 2px;">$1</span>'
    );
    
    // Then show the resulting command after removal
    let result = commandText;
    const patterns = [
        new RegExp(`\\s*--\\S+\\s+\\{${param.name}\\}\\s*`, 'g'),
        new RegExp(`\\s*--\\S+=\\{${param.name}\\}\\s*`, 'g'),
        new RegExp(`\\s*-\\S\\s+\\{${param.name}\\}\\s*`, 'g'),
        new RegExp(`\\s*\\/\\S+\\s+\\{${param.name}\\}\\s*`, 'g'),
        new RegExp(`\\s*-\\S+:\\{${param.name}\\}\\s*`, 'g'),
        new RegExp(`\\s*-D\\S+=\\{${param.name}\\}\\s*`, 'g'),
        new RegExp(`\\s*--\\S+=\\{${param.name}\\}:[^\\s]+\\s*`, 'g'),
        new RegExp(`\\s*--\\s+\\{${param.name}\\}\\s*`, 'g')
    ];
    for (const pattern of patterns) {
        result = result.replace(pattern, ' ');
    }
    
    return `<div style="margin-bottom: 5px"><strong>Before:</strong> ${highlighted}</div>
            <div><strong>After:</strong> ${result.replace(/\s+/g, ' ').trim()}</div>`;
}

// Group dialog functions
function showGroupDialog() {
    const overlay = document.getElementById('groupDialogOverlay');
    overlay.style.display = 'flex';
    
    // Focus the input after a small delay
    setTimeout(() => {
        const input = document.getElementById('newGroupName');
        if (input) {
            input.focus();
            input.value = '';
        }
    }, 50);
}

function hideGroupDialog() {
    document.getElementById('groupDialogOverlay').style.display = 'none';
}

function addNewGroup() {
    showGroupDialog();
}

function createNewGroup() {
    const newGroup = document.getElementById('newGroupName').value.trim();
    
    if (newGroup) {
        // Add the new group to hidden input
        const hiddenInput = document.getElementById('group');
        const displayText = document.getElementById('selected-group-text');
        
        hiddenInput.value = newGroup;
        
        // Format display text for nested groups
        if (newGroup.includes('/')) {
            const segments = newGroup.split('/');
            const lastSegment = segments.pop();
            displayText.textContent = lastSegment;
            
            // Create tooltip showing full path
            displayText.title = newGroup;
            
            // Add nested indicator
            const nestedIndicator = document.createElement('span');
            nestedIndicator.className = 'nested-path';
            nestedIndicator.textContent = ` (in ${segments.join('/')})`;
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

// Save command function
function saveCommand() {
    // Validate form
    const label = document.getElementById('label').value.trim();
    const command = document.getElementById('command').value.trim();
    const description = document.getElementById('description').value.trim();
    const group = document.getElementById('group').value;
    const autoExecute = document.getElementById('autoExecute').checked;
    const clearTerminal = document.getElementById('clearTerminal').checked;
    const escapeKeyBefore = document.getElementById('escapeKeyBefore').checked;
    const keybinding = document.getElementById('keybinding').value.trim(); // Get keybinding value
    
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
        const description = item.querySelector('.param-description')?.value || '';
        const defaultValue = item.querySelector('.param-default')?.value || '';
        const optional = item.querySelector('.param-optional')?.checked || false;
        
        parameters.push({
            name,
            description: description || undefined,
            defaultValue: defaultValue || undefined,
            optional
        });
    });
    
    // Create command object
    const commandData = {
        label,
        command,
        description: description || undefined,
        autoExecute,
        clearTerminal,
        escapeKeyBefore,
        group,
        parameters: parameters.length > 0 ? parameters : undefined,
        keybinding: keybinding || undefined // Add keybinding to the command data
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
    
    // Keybinding recording
    const keybindingInput = document.getElementById('keybinding');
    const recordKeybindingBtn = document.getElementById('recordKeybindingBtn');
    const clearKeybindingBtn = document.getElementById('clearKeybindingBtn');
    
    let isRecording = false;
    
    recordKeybindingBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
    
    clearKeybindingBtn.addEventListener('click', () => {
        keybindingInput.value = '';
    });
    
    function startRecording() {
        isRecording = true;
        recordKeybindingBtn.textContent = 'Press keys...';
        keybindingInput.value = '';
        keybindingInput.classList.add('keybinding-recording');
        keybindingInput.focus();
        
        // Listen for keydown events
        document.addEventListener('keydown', recordKeybinding);
    }
    
    function stopRecording() {
        isRecording = false;
        recordKeybindingBtn.textContent = 'Record Keys';
        keybindingInput.classList.remove('keybinding-recording');
        
        document.removeEventListener('keydown', recordKeybinding);
    }
    
    function recordKeybinding(e) {
        e.preventDefault();
        
        // Build the keybinding string
        const modifiers = [];
        
        if (e.ctrlKey) modifiers.push('ctrl');
        if (e.altKey) modifiers.push('alt');
        if (e.shiftKey) modifiers.push('shift');
        if (e.metaKey) modifiers.push('cmd'); // For Mac
        
        const key = e.key.toLowerCase();
        
        // Don't record if only modifier keys were pressed
        if (['control', 'alt', 'shift', 'meta'].includes(key)) {
            return;
        }
        
        // Create the keybinding string
        let keybinding = modifiers.join('+');
        if (keybinding && key) keybinding += '+';
        keybinding += key;
        
        // Set the input value
        keybindingInput.value = keybinding;
        
        // Stop recording
        stopRecording();
    }
    
    // Handle direct keyboard input
    keybindingInput.addEventListener('keydown', (e) => {
        if (isRecording) {
            // Already handled by the recordKeybinding function
            return;
        }
        
        // Start recording if user types in the input
        if (!e.ctrlKey && !e.metaKey && e.key !== 'Tab') {
            e.preventDefault();
            startRecording();
        }
    });
}

// Populate groups dropdown - tree-based implementation
function initializeDropdownTree() {
    // Get references to DOM elements
    const dropdownHeader = document.getElementById('selected-group-display');
    const dropdownContent = document.getElementById('group-dropdown-content');
    const selectedGroupText = document.getElementById('selected-group-text');
    const hiddenInput = document.getElementById('group');
    const treeContainer = document.getElementById('group-tree');
    const searchInput = document.getElementById('group-search');
    
    // Sort groups to create hierarchy
    const sortedGroups = [...window.existingGroups].sort();
    
    // Build tree structure from flat path list
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
    if (window.commandToEdit && window.commandToEdit.group) {
        const groupPath = window.commandToEdit.group;
        const lastSegment = groupPath.split('/').pop();
        selectGroup(groupPath, lastSegment);
    }
}

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
        if (window.existingGroups.length === 0) {
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
                innerHtml += `<span class="tree-item-indent">${branchChar}─</span>`;
            } else {
                // Other levels get either a vertical line or space
                innerHtml += `<span class="tree-item-indent">${!isLastGroup[i] ? '│' : ' '}</span>`;
            }
        }
        
        // Icon based on whether this is a parent or leaf node
        const hasChildren = Object.keys(node.children).length > 0;
        const icon = hasChildren ? 'folder' : 'symbol-field';
        
        innerHtml += `<i class="codicon codicon-${icon} tree-item-icon"></i><span>${key}</span>`;
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

function selectGroup(value, displayText) {
    const hiddenInput = document.getElementById('group');
    const selectedGroupText = document.getElementById('selected-group-text');
    const dropdownContent = document.getElementById('group-dropdown-content');
    const dropdownHeader = document.getElementById('selected-group-display');
    const treeContainer = document.getElementById('group-tree');
    
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
        nestedIndicator.textContent = ` (in ${segments.join('/')})`;
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
    if (window.commandToEdit) {
        window.commandToEdit.group = value;
    }
}

function filterTree(searchText) {
    const treeContainer = document.getElementById('group-tree');
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