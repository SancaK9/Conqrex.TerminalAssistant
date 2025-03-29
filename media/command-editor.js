// Access VSCode API
const vscode = acquireVsCodeApi();

// At the top of the file, add a global variable to hold existing shortcuts
let existingShortcuts = [];

// Function to show loader with custom message
function showLoader(message = 'Saving command...') {
    const loaderText = document.getElementById('loaderText');
    const loaderOverlay = document.getElementById('loaderOverlay');
    
    loaderText.textContent = message;
    loaderOverlay.classList.add('active');
}

// Function to hide loader
function hideLoader() {
    const loaderOverlay = document.getElementById('loaderOverlay');
    loaderOverlay.classList.remove('active');
}

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    setupEventListeners();
    
    // Listen for messages from the extension - only add this listener once
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'saveSuccess':
                // Success! The extension will close the webview
                console.log('Save success received');
                break;
                
            case 'saveError':
                // Hide loader and show error
                hideLoader();
                alert(message.message || 'Failed to save command');
                break;
        }
    });
});

// Initialize form fields
function initializeForm() {
    // Initialize the custom dropdown for groups
    initializeDropdownTree();
    
    // Get existing shortcuts from window context (we'll add this to the HTML data passing)
    existingShortcuts = window.existingShortcuts || [];
    
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
    
    // Clear previous content
    container.innerHTML = '';
    document.getElementById('parameters-count').textContent = "(" + uniqueParams.length + ")";
    
    if (uniqueParams.length === 0) {
        // Show empty state
        container.innerHTML = `
            <div class="parameters-empty-state" id="no-parameters-message">
                <div class="empty-state-icon">
                    <i class="codicon codicon-bracket"></i>
                </div>
                <div class="empty-state-message">
                    <p>No parameters detected yet.</p>
                    <p>Add parameters to your command using the syntax <span class="example-tag">{parameterName}</span>.</p>
                    <p>For example: <span class="example-tag">git commit -m "{message}"</span></p>
                </div>
            </div>
        `;
        return;
    }
    
    // Create a horizontal container for parameter cards
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'parameter-cards';
    cardsContainer.id = 'parameter-cards-container';
    container.appendChild(cardsContainer);
    
    // Create UI for each parameter
    uniqueParams.forEach((param, index) => {
        createParameterCard(param, index + 1, cardsContainer);
    });
    
    // Initialize scroll indicators
    initializeParameterScroll(cardsContainer);
}

// Create a parameter card in the horizontal scrolling container
function createParameterCard(param, index, container) {
    const card = document.createElement('div');
    card.className = 'parameter-card';
    card.dataset.paramName = param.name;
    
    const badge = document.createElement('div');
    badge.className = 'parameter-badge';
    badge.textContent = index;
    card.appendChild(badge);
    
    // Parameter name
    const nameEl = document.createElement('div');
    nameEl.className = 'parameter-name';
    nameEl.innerHTML = `
        <i class="codicon codicon-symbol-parameter"></i>
        ${param.name}
    `;
    card.appendChild(nameEl);
    
    // Parameter options
    const optionsEl = document.createElement('div');
    optionsEl.className = 'parameter-options';
    
    // Default value option
    const defaultOption = document.createElement('div');
    defaultOption.className = 'parameter-option';
    defaultOption.innerHTML = `
        <div class="parameter-option-label">Default:</div>
        <div class="parameter-option-input">
            <input type="text" class="param-default" placeholder="Default value" value="${param.defaultValue || ''}">
        </div>
    `;
    optionsEl.appendChild(defaultOption);
    
    // Type selection option (can be expanded later)
    const typeOption = document.createElement('div');
    typeOption.className = 'parameter-option';
    typeOption.innerHTML = `
        <div class="parameter-option-label">Desc:</div>
        <div class="parameter-option-input">
            <input type="text" class="param-description" placeholder="Description" value="${param.description || ''}">
        </div>
    `;
    optionsEl.appendChild(typeOption);
    
    // Add optional checkbox if applicable
    if (detectIfParameterHasFlag(param.name)) {
        const optionalOption = document.createElement('div');
        optionalOption.className = 'parameter-option';
        optionalOption.innerHTML = `
            <div class="checkbox-small" style="display: flex; align-items: center;">
                <input type="checkbox" id="optional-${param.name}" class="param-optional" ${param.optional ? 'checked' : ''}>
                <label for="optional-${param.name}" style="margin-left: 5px; font-size: 12px;">Remove if empty</label>
                <i class="codicon codicon-info" style="margin-left: 4px; cursor: help; font-size: 12px; opacity: 0.7;" 
                   title="If checked and parameter is empty, the entire flag will be removed. If unchecked, the flag will remain but with empty value."></i>
            </div>
        `;
        
        // Add explanation about flag behavior
        const flagExplanation = document.createElement('div');
        flagExplanation.className = 'flag-explanation';
        flagExplanation.style.fontSize = '11px';
        flagExplanation.style.color = 'var(--vscode-descriptionForeground)';
        flagExplanation.style.marginTop = '4px';
        flagExplanation.style.borderLeft = '2px solid var(--vscode-focusBorder)';
        flagExplanation.style.paddingLeft = '6px';
        
        // Get flag from command
        const commandText = document.getElementById('command').value;
        const flag = extractFlagForParameter(param.name, commandText);
        
        // Create explanation text with examples
        flagExplanation.innerHTML = `
            <div style="margin-bottom: 3px; font-weight: 500;">When ${param.name} is empty:</div>
            <div style="display: flex; align-items: center; margin-bottom: 2px;">
                <span style="color: var(--vscode-gitDecoration-addedResourceForeground); margin-right: 4px;">✓</span>
                <span><b>Checked:</b> ${flag} removed entirely</span>
            </div>
            <div style="display: flex; align-items: center;">
                <span style="color: var(--vscode-errorForeground); margin-right: 4px;">✕</span>
                <span><b>Unchecked:</b> ${flag} stays with empty value</span>
            </div>
        `;
        
        optionalOption.appendChild(flagExplanation);
        optionsEl.appendChild(optionalOption);
    }
    
    card.appendChild(optionsEl);
    
    // Parameter tag display
    const controlsEl = document.createElement('div');
    controlsEl.className = 'parameter-controls';
    controlsEl.innerHTML = `
        <div>
            <span class="parameter-tag">{${param.name}}</span>
        </div>
    `;
    card.appendChild(controlsEl);
    
    // Add the card to the container
    container.appendChild(card);
}

// Helper function to extract the flag being used with a parameter
function extractFlagForParameter(paramName, commandText) {
    const patterns = [
        { regex: new RegExp(`(--\\S+)\\s+\\{${paramName}\\}`), group: 1 },
        { regex: new RegExp(`(--\\S+)=\\{${paramName}\\}`), group: 1 },
        { regex: new RegExp(`(-\\S)\\s+\\{${paramName}\\}`), group: 1 },
        { regex: new RegExp(`(\\/\\S+)\\s+\\{${paramName}\\}`), group: 1 },
        { regex: new RegExp(`(-\\S+):\\{${paramName}\\}`), group: 1 },
        { regex: new RegExp(`(-D\\S+)=\\{${paramName}\\}`), group: 1 }
    ];

    for (const pattern of patterns) {
        const match = commandText.match(pattern.regex);
        if (match) {
            return match[pattern.group];
        }
    }

    // Generic case if no specific pattern matches
    return `flag for {${paramName}}`;
}

// Helper function to detect if a parameter is used with a flag
function detectIfParameterHasFlag(paramName) {
    const commandText = document.getElementById('command').value;
    return [
        new RegExp(`--\\S+\\s+\\{${paramName}\\}`),
        new RegExp(`--\\S+=\\{${paramName}\\}`),
        new RegExp(`-\\S\\s+\\{${paramName}\\}`),
        new RegExp(`\\/\\S+\\s+\\{${paramName}\\}`),
        new RegExp(`-\\S+:\\{${paramName}\\}`),
        new RegExp(`-D\\S+=\\{${paramName}\\}`)
    ].some(pattern => pattern.test(commandText));
}

// Initialize scroll indicators and handling for parameter cards
function initializeParameterScroll(container) {
    // Initial check for scroll indicators
    updateScrollIndicators(container);
    
    // Listen for scroll events
    container.addEventListener('scroll', () => {
        updateScrollIndicators(container);
    });
    
    // Also update on window resize
    window.addEventListener('resize', () => {
        updateScrollIndicators(container);
    });
}

// Update scroll indicators based on scroll position
function updateScrollIndicators(container) {
    const hasLeftScroll = container.scrollLeft > 10;
    const hasRightScroll = container.scrollLeft < (container.scrollWidth - container.clientWidth - 10);
    
    container.classList.toggle('scroll-left', hasLeftScroll);
    container.classList.toggle('scroll-right', hasRightScroll);
    
    // If we have parameters but they all fit (no scrolling needed)
    if (!hasLeftScroll && !hasRightScroll && container.scrollWidth > container.clientWidth) {
        container.classList.add('no-scroll-needed');
    } else {
        container.classList.remove('no-scroll-needed');
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
    const keybinding = document.getElementById('keybinding').value.trim();
    
    // Basic validation
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
    
    // Check for duplicate shortcut
    if (keybinding) {
        const duplicate = checkDuplicateShortcut(keybinding);
        if (duplicate) {
            const confirmOverride = confirm(
                `Warning: The shortcut "${keybinding}" is already used by "${duplicate.label}". \n\n` +
                `Do you want to override it?`
            );
            
            if (!confirmOverride) {
                return; // Don't save if user cancels
            }
        }
    }
    
    // Show loader before proceeding
    showLoader(window.commandToEdit ? 'Updating command...' : 'Creating command...');
    
    // Collect parameters from cards
    const parameters = [];
    document.querySelectorAll('.parameter-card').forEach(card => {
        const name = card.dataset.paramName;
        const description = card.querySelector('.param-description')?.value || '';
        const defaultValue = card.querySelector('.param-default')?.value || '';
        const optional = card.querySelector('.param-optional')?.checked || false;
        
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
        keybinding: keybinding || undefined
    };
    
    // Debugging - log that we're sending data
    console.log('Sending command data to extension');
    
    // Send to extension
    vscode.postMessage({
        command: 'saveCommand',
        commandData
    });
}

// Add a function to check for duplicate shortcuts
function checkDuplicateShortcut(keybinding) {
    if (!keybinding) return null;
    
    // Check existing Terminal Assistant shortcuts
    const existingCommand = existingShortcuts.find(s => s.keybinding === keybinding && 
        (!window.commandToEdit || s.label !== window.commandToEdit.label));
    
    if (existingCommand) {
        return existingCommand;
    }
    
    return null;
}

// Add validation feedback to the keybinding input
function updateKeybindingValidation(keybinding) {
    const keybindingContainer = document.querySelector('.keybinding-container');
    // Find existing validation or create a new one after the keybinding container
    const validationMsg = document.getElementById('keybinding-validation') || 
        createValidationElement('keybinding-validation', keybindingContainer.parentElement, keybindingContainer);
    
    // Check for duplicates
    const duplicate = checkDuplicateShortcut(keybinding);
    
    if (duplicate) {
        validationMsg.textContent = `Warning: This shortcut is already used by "${duplicate.label}"`;
        validationMsg.style.display = 'block';
        validationMsg.className = 'validation-error';
        document.getElementById('keybinding').classList.add('input-warning');
        
        // Make the clear button more noticeable when there's a warning
        document.getElementById('clearKeybindingBtn').classList.add('warning-clear');
        return false;
    } else {
        validationMsg.style.display = 'none';
        document.getElementById('keybinding').classList.remove('input-warning');
        document.getElementById('clearKeybindingBtn').classList.remove('warning-clear');
        return true;
    }
}

// Helper function to create validation message elements
function createValidationElement(id, parentElement, afterElement = null) {
    // Remove existing element if it exists
    const existing = document.getElementById(id);
    if (existing) {
        existing.parentElement.removeChild(existing);
    }
    
    const validationElement = document.createElement('div');
    validationElement.id = id;
    validationElement.className = 'validation-error';
    validationElement.style.color = 'var(--vscode-errorForeground)';
    validationElement.style.fontSize = '12px';
    validationElement.style.marginTop = '4px';
    validationElement.style.display = 'none';
    validationElement.style.width = '100%'; // Take full width
    
    // Insert after specified element if provided, otherwise append to parent
    if (afterElement && afterElement.parentElement === parentElement) {
        afterElement.insertAdjacentElement('afterend', validationElement);
    } else {
        parentElement.appendChild(validationElement);
    }
    
    return validationElement;
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
    
    // Enhanced clear button functionality
    clearKeybindingBtn.addEventListener('click', () => {
        // Clear the input value
        keybindingInput.value = '';
        
        // Remove any warning classes
        keybindingInput.classList.remove('input-warning', 'keybinding-recording');
        
        // Hide the validation message
        const validationMsg = document.getElementById('keybinding-validation');
        if (validationMsg) {
            validationMsg.style.display = 'none';
        }
        
        // Add visual feedback for the clear action
        clearKeybindingBtn.classList.add('button-flash');
        setTimeout(() => {
            clearKeybindingBtn.classList.remove('button-flash');
        }, 300);
        
        // Focus back on the keybinding input
        keybindingInput.focus();
        
        // If we're recording, stop it
        if (isRecording) {
            stopRecording();
        }
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
        
        // Use e.code instead of e.key to get the physical key, not the character
        let key = '';
        
        // Map the code to a key name that VS Code expects
        if (e.code.startsWith('Key')) {
            // Key codes like "KeyQ" -> "q"
            key = e.code.slice(3).toLowerCase();
        } else if (e.code.startsWith('Digit')) {
            // Digit codes like "Digit1" -> "1" 
            key = e.code.slice(5);
        } else if (e.code.startsWith('Numpad')) {
            // Numpad keys
            key = 'numpad' + e.code.slice(6).toLowerCase();
        } else {
            // Handle other special keys
            switch (e.code) {
                case 'Backquote': key = '`'; break;
                case 'Minus': key = '-'; break;
                case 'Equal': key = '='; break;
                case 'BracketLeft': key = '['; break;
                case 'BracketRight': key = ']'; break;
                case 'Backslash': key = '\\'; break;
                case 'Semicolon': key = ';'; break;
                case 'Quote': key = '\''; break;
                case 'Comma': key = ','; break;
                case 'Period': key = '.'; break;
                case 'Slash': key = '/'; break;
                case 'Space': key = 'space'; break;
                
                // Function keys
                case 'F1': case 'F2': case 'F3': case 'F4': 
                case 'F5': case 'F6': case 'F7': case 'F8':
                case 'F9': case 'F10': case 'F11': case 'F12':
                    key = e.code.toLowerCase();
                    break;
                    
                // Special keys
                case 'Tab': key = 'tab'; break;
                case 'Enter': key = 'enter'; break;
                case 'Escape': key = 'escape'; break;
                case 'Home': key = 'home'; break;
                case 'End': key = 'end'; break;
                case 'PageUp': key = 'pageup'; break;
                case 'PageDown': key = 'pagedown'; break;
                case 'ArrowUp': key = 'up'; break;
                case 'ArrowDown': key = 'down'; break;
                case 'ArrowLeft': key = 'left'; break;
                case 'ArrowRight': key = 'right'; break;
                case 'Delete': key = 'delete'; break;
                case 'Insert': key = 'insert'; break;
                
                default:
                    // If not a standard key, don't record it
                    console.log("Ignoring non-standard key:", e.code);
                    return;
            }
        }
        
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
        
        // Validate the shortcut
        updateKeybindingValidation(keybinding);
        
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
        
        if (!isVisible) {
            // Display dropdown - using default absolute positioning
            dropdownContent.style.display = 'block';
            dropdownHeader.classList.add('dropdown-open');
            
            // Clear search when opening
            searchInput.value = '';
            filterTree('');
            searchInput.focus();
        } else {
            // Hide dropdown
            dropdownContent.style.display = 'none';
            dropdownHeader.classList.remove('dropdown-open');
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