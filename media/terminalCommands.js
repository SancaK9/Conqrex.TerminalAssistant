// Terminal Commands Webview Script
const vscode = acquireVsCodeApi();
let allCommands = [];
let expandedGroups = new Set();
let pinnedCommands = [];
let recentCommands = [];
let activeTab = 'all'; // Track the active tab

// Initialize the view when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
	// Initialize search elements
	const searchInput = document.getElementById('searchInput');
	const clearSearchBtn = document.getElementById('clearSearchBtn');
	const searchIcon = document.querySelector('.search-icon');
	
	// Handle search input
	searchInput.addEventListener('input', () => {
		const searchTerm = searchInput.value;
		clearSearchBtn.style.display = searchTerm ? 'flex' : 'none';
		
		// Add active class to search icon when typing
		if (searchTerm) {
			searchIcon.classList.add('active');
			vscode.postMessage({ type: 'search', searchTerm });
			// Save search state when user types
			vscode.postMessage({ type: 'saveSearchState', searchTerm });
		} else {
			searchIcon.classList.remove('active');
			renderCommands(allCommands);
		}
	});
	
	// Clear search
	clearSearchBtn.addEventListener('click', () => {
		searchInput.value = '';
		clearSearchBtn.style.display = 'none';
		searchIcon.classList.remove('active');
		renderCommands(allCommands);
		searchInput.focus();
		// Clear saved search state
		vscode.postMessage({ type: 'saveSearchState', searchTerm: '' });
	});
	
	// Add focus effect to search wrapper
	searchInput.addEventListener('focus', () => {
		document.querySelector('.search-wrapper').classList.add('focused');
	});
	
	searchInput.addEventListener('blur', () => {
		document.querySelector('.search-wrapper').classList.remove('focused');
	});
	
	// Add command button
	document.getElementById('addCommandBtn').addEventListener('click', () => {
		vscode.postMessage({ type: 'addCommand' });
	});
	
	// Delete confirmation dialog buttons
	document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
	document.getElementById('cancelDeleteBtn').addEventListener('click', hideDeleteConfirmation);

	// Close dialog when clicking outside
	document.getElementById('deleteConfirmationDialog').addEventListener('click', (event) => {
		if (event.target === document.getElementById('deleteConfirmationDialog')) {
			hideDeleteConfirmation();
		}
	});

	// Setup tab buttons
	setupTabNavigation();

	// Initial render of commands to ensure they're visible
	setTimeout(() => {
		console.log("Initial rendering of commands:", allCommands.length);
		if (allCommands.length > 0) {
			// Force a refresh based on the active tab
			switch(activeTab) {
				case 'pinned':
					renderPinnedCommands(pinnedCommands);
					break;
				case 'recent':
					renderRecentCommands(recentCommands);
					break;
				default:
					renderCommands(allCommands);
			}
		} else {
			// If no commands are loaded yet, request them from the extension
			vscode.postMessage({ type: 'requestCommands' });
		}
	}, 300); // Increased timeout for better reliability

	// Add animation effects to the "Add Command" button
	const addCommandBtn = document.getElementById('addCommandBtn');
	if (addCommandBtn) {
		addCommandBtn.addEventListener('mouseenter', () => {
			const icon = addCommandBtn.querySelector('.codicon-add');
			if (icon) {
				icon.style.transform = 'rotate(90deg) scale(1.1)';
			}
		});
		
		addCommandBtn.addEventListener('mouseleave', () => {
			const icon = addCommandBtn.querySelector('.codicon-add');
			if (icon) {
				icon.style.transform = '';
			}
		});
	}
});

// Setup tab navigation behavior
function setupTabNavigation() {
	const tabButtons = document.querySelectorAll('.tab-button');
	
	tabButtons.forEach(button => {
		button.addEventListener('click', () => {
			// Get the tab to show
			const tabId = button.getAttribute('data-tab');
			switchTab(tabId);
		});
	});
	
	// Update tab counters
	updateTabCounters();
}

// Switch between tabs
function switchTab(tabId) {
	// Store the active tab
	activeTab = tabId;
	
	// Deactivate all tabs
	document.querySelectorAll('.tab-button').forEach(tab => {
		tab.classList.remove('active');
	});
	
	document.querySelectorAll('.tab-pane').forEach(pane => {
		pane.classList.remove('active');
	});
	
	// Activate the selected tab
	document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
	
	// Show the selected tab content
	let tabContentId;
	switch (tabId) {
		case 'pinned':
			tabContentId = 'pinnedCommandsTab';
			// Make sure pinned commands are rendered
			renderPinnedCommands(pinnedCommands);
			break;
		case 'recent':
			tabContentId = 'recentCommandsTab';
			// Make sure recent commands are rendered
			renderRecentCommands(recentCommands);
			break;
		default:
			tabContentId = 'allCommandsTab';
			// Make sure all commands are rendered
			renderCommands(allCommands);
	}
	
	document.getElementById(tabContentId).classList.add('active');
	
	// If switching to the "all" tab, we may need to adjust group scrollHeight
	if (tabId === 'all') {
		setTimeout(() => {
			document.querySelectorAll('.group-content').forEach(content => {
				if (content.style.maxHeight !== '0px') {
					content.style.maxHeight = content.scrollHeight + 1000 + 'px';
				}
			});
		}, 50);
	}
}

// Update the counters in the tab buttons
function updateTabCounters() {
	// Count for pinnedCommands tab
	const pinnedCount = pinnedCommands.length;
	const pinnedTab = document.querySelector('.tab-button[data-tab="pinned"]');
	let pinnedCounter = pinnedTab.querySelector('.tab-counter');
	
	if (pinnedCount > 0) {
		if (!pinnedCounter) {
			pinnedCounter = document.createElement('span');
			pinnedCounter.className = 'tab-counter';
			pinnedTab.appendChild(pinnedCounter);
		}
		pinnedCounter.textContent = pinnedCount;
	} else if (pinnedCounter) {
		pinnedCounter.remove();
	}
	
	// Count for recentCommands tab
	const recentCount = recentCommands.length;
	const recentTab = document.querySelector('.tab-button[data-tab="recent"]');
	let recentCounter = recentTab.querySelector('.tab-counter');
	
	if (recentCount > 0) {
		if (!recentCounter) {
			recentCounter = document.createElement('span');
			recentCounter.className = 'tab-counter';
			recentTab.appendChild(recentCounter);
		}
		recentCounter.textContent = recentCount;
	} else if (recentCounter) {
		recentCounter.remove();
	}
}

// Handle messages from the extension
window.addEventListener('message', event => {
	const message = event.data;
	
	switch (message.type) {
		case 'refreshCommands':
			console.log("Received commands:", message.commands?.length);
			allCommands = message.commands || [];
			pinnedCommands = message.pinnedCommands || [];
			recentCommands = message.recentCommands || [];
			
			// Always render commands in the current active tab
			switch(activeTab) {
				case 'pinned':
					renderPinnedCommands(pinnedCommands);
					break;
				case 'recent':
					renderRecentCommands(recentCommands);
					break;
				default:
					renderCommands(allCommands);
			}
			updateTabCounters();
			break;
			
		case 'searchResults':
			renderCommands(message.commands, true);
			// Switch to all tab during search
			switchTab('all');
			break;
			
		case 'focusSearch':
			// Focus on the search box
			setTimeout(() => {
				document.getElementById('searchInput').focus();
			}, 100);
			break;
			
		case 'restoreSearch':
			const searchInput = document.getElementById('searchInput');
			const clearSearchBtn = document.getElementById('clearSearchBtn');
			const searchIcon = document.querySelector('.search-icon');
			
			searchInput.value = message.searchTerm;
			clearSearchBtn.style.display = message.searchTerm ? 'flex' : 'none';
			
			if (message.searchTerm) {
				searchIcon.classList.add('active');
				vscode.postMessage({ type: 'search', searchTerm: message.searchTerm });
				// Hide pinned and recent sections during search
				document.getElementById('pinnedCommandsSection').style.display = 'none';
				document.getElementById('recentCommandsSection').style.display = 'none';
			} else {
				searchIcon.classList.remove('active');
				// Show pinned and recent sections if search is cleared
				document.getElementById('pinnedCommandsSection').style.display = 'block';
				document.getElementById('recentCommandsSection').style.display = 'block';
			}
			break;
			
		case 'updatePinnedCommands':
			pinnedCommands = message.pinnedCommands || [];
			renderPinnedCommands(pinnedCommands);
			
			// Also update the pin status in the main commands list
			if (activeTab === 'all') {
				// Re-render all commands with updated pin status
				renderCommands(allCommands);
			}
			
			updateTabCounters();
			break;
			
		case 'updateRecentCommands':
			recentCommands = message.recentCommands || [];
			renderRecentCommands(recentCommands);
			updateTabCounters();
			break;
	}
});

// Build nested group structure from flat command list
function buildGroupHierarchy(commands) {
	const groups = {};
	
	// First, create all group paths and associate commands
	commands.forEach(cmd => {
		const groupPath = cmd.group;
		const segments = groupPath.split('/');
		
		// Ensure all parent paths exist
		let currentPath = '';
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			
			if (!groups[currentPath]) {
				groups[currentPath] = {
					name: segment,
					path: currentPath,
					commands: [],
					subgroups: [],
					parent: i > 0 ? segments.slice(0, i).join('/') : null
				};
			}
		}
		
		// Add command to its group
		groups[groupPath].commands.push(cmd);
	});
	
	// Now build the hierarchy by adding each group to its parent's subgroups
	Object.values(groups).forEach(group => {
		if (group.parent) {
			groups[group.parent].subgroups.push(group);
		}
	});
	
	// Return only root groups (those without parents)
	return Object.values(groups).filter(group => !group.parent);
}

// Count all commands in a group and its subgroups
function countCommands(group) {
	let count = group.commands.length;
	group.subgroups.forEach(subgroup => {
		count += countCommands(subgroup);
	});
	return count;
}

// Helper function to check if two commands are the same
function isCommandEqual(cmd1, cmd2) {
	if (!cmd1 || !cmd2) return false;
	
	return cmd1.label === cmd2.label && 
		   cmd1.command === cmd2.command && 
		   cmd1.group === cmd2.group;
}

// Function to render pinned commands
function renderPinnedCommands(commands) {
	const container = document.getElementById('pinnedCommandsContainer');
	container.innerHTML = '';
	
	if (!commands || commands.length === 0) {
		container.innerHTML = `
			<div class="empty-state">
				<div class="icon-container">
					<i class="codicon codicon-pin"></i>
				</div>
				<h3 class="title">No Pinned Commands</h3>
				<p class="message">Pin your favorite commands for quick access by clicking the pin icon on any command.</p>
				<div class="action">
					<button class="primary-button new-command-button" id="addPinnedCommandBtnEmpty">
						<i class="codicon codicon-add"></i>
						<span class="button-text">Add Command</span>
					</button>
				</div>
			</div>
		`;
		
		document.getElementById('addPinnedCommandBtnEmpty')?.addEventListener('click', () => {
			vscode.postMessage({ type: 'addCommand' });
		});
		
		return;
	}
	
	commands.forEach(cmd => {
		const commandItem = createCommandItem(cmd, true);
		container.appendChild(commandItem);
	});
}

// Function to render recent commands
function renderRecentCommands(commands) {
	const container = document.getElementById('recentCommandsContainer');
	container.innerHTML = '';
	
	if (!commands || commands.length === 0) {
		container.innerHTML = `
			<div class="empty-state">
				<div class="icon-container">
					<i class="codicon codicon-history"></i>
				</div>
				<h3 class="title">No Recent Commands</h3>
				<p class="message">Commands you execute will appear here for quick access.</p>
			</div>
		`;
		return;
	}
	
	commands.forEach(cmd => {
		const commandItem = createCommandItem(cmd);
		container.appendChild(commandItem);
	});
}

// Helper function to create command items (for both pinned, recent, and regular commands)
function createCommandItem(cmd, isPinned = false) {
	const commandItem = document.createElement('div');
	commandItem.className = 'command-item';
	
	// Highlight parameters in command display
	let commandText = cmd.command;
	if (cmd.parameters && cmd.parameters.length > 0) {
		cmd.parameters.forEach(param => {
			const paramRegex = new RegExp('\\{' + param.name + '\\}', 'g');
			commandText = commandText.replace(
				paramRegex,
				'<span class="command-parameter">{' + param.name + '}</span>'
			);
		});
	}
	
	commandItem.innerHTML = `
		<div class="command-icon">
			<i class="codicon codicon-terminal icon-margin"></i>
		</div>
		<div class="command-content">
			<div class="command-label">
				${cmd.label} <span style="opacity:0.7">(${cmd.group})</span>
			</div>
			<div class="command-description">${cmd.description || commandText}</div>
			${cmd.keybinding ? `<span class="keybinding-badge" title="Keyboard shortcut: ${cmd.keybinding}">${cmd.keybinding}</span>` : ''}
		</div>
		<div class="command-actions">
			<button class="action-button pin-btn ${isPinned ? 'pinned' : ''}" title="${isPinned ? 'Unpin Command' : 'Pin Command'}">
				<i class="codicon codicon-pin"></i>
			</button>
			<button class="action-button run-btn" title="Run Command">
				<i class="codicon codicon-play"></i>
			</button>
			<button class="action-button edit-btn" title="Edit Command">
				<i class="codicon codicon-edit"></i>
			</button>
			<button class="action-button remove-btn" title="Delete Command">
				<i class="codicon codicon-trash"></i>
			</button>
		</div>
	`;
	
	// Run the command
	commandItem.querySelector('.run-btn').addEventListener('click', (event) => {
		event.stopPropagation();
		vscode.postMessage({
			type: 'executeCommand',
			command: cmd
		});
	});
	
	// Edit the command
	commandItem.querySelector('.edit-btn').addEventListener('click', (event) => {
		event.stopPropagation();
		vscode.postMessage({
			type: 'editCommand',
			command: cmd
		});
	});
	
	// Remove the command
	commandItem.querySelector('.remove-btn').addEventListener('click', (event) => {
		event.stopPropagation();
		showDeleteConfirmation(cmd);
	});
	
	// Toggle pin state
	commandItem.querySelector('.pin-btn').addEventListener('click', (event) => {
		event.stopPropagation();
		const pinButton = event.currentTarget;
		const currentlyPinned = pinButton.classList.contains('pinned');
		
		if (currentlyPinned) {
			pinButton.classList.remove('pinned');
			pinButton.title = 'Pin Command';
		} else {
			pinButton.classList.add('pinned');
			pinButton.title = 'Unpin Command';
		}
		
		vscode.postMessage({
			type: 'togglePinCommand',
			command: cmd,
			isPinned: !currentlyPinned
		});
	});
	
	// Execute the command
	commandItem.addEventListener('click', () => {
		// Execute the command
		vscode.postMessage({
			type: 'executeCommand',
			command: cmd
		});
		
		// We don't need to update the UI here for pins or recent commands
		// since the extension will send us the updated lists
	});
	
	return commandItem;
}

// Render commands grouped by their group property
function renderCommands(commands, isSearchResult = false) {
	console.log("Rendering commands:", commands?.length);
	const container = document.getElementById('commandsContainer');
	if (!container) {
		console.error("Commands container not found!");
		return;
	}
	container.innerHTML = '';
	
	// Show or hide other sections based on context
	if (!isSearchResult) {
		// No need to manipulate deprecated sections
	}
	
	if (!commands || commands.length === 0) {
		container.innerHTML = `
			<div class="empty-state">
				<div class="icon-container">
					<i class="codicon codicon-terminal"></i>
				</div>
				<h3 class="title">No commands found</h3>
				<p class="message">There are no commands available. You can add a new command to get started.</p>
				<div class="action">
					<button class="primary-button new-command-button" id="addCommandBtnEmpty">
						<i class="codicon codicon-add"></i>
						<span class="button-text">Add Command</span>
					</button>
				</div>
			</div>
		`;
		
		document.getElementById('addCommandBtnEmpty')?.addEventListener('click', () => {
			vscode.postMessage({ type: 'addCommand' });
		});
		
		return;
	}
	
	// If search is active, flatten the hierarchy
	if (document.getElementById('searchInput').value.trim()) {
		// Create a flat list of commands with their full paths for better context in search results
		const flatCommandList = commands.map(cmd => {
			return {
				...cmd,
				fullLabel: `${cmd.label} (${cmd.group})`
			};
		});
		
		// Filter commands based on search term
		const searchTerm = document.getElementById('searchInput').value.toLowerCase();
		const searchResults = flatCommandList.filter(cmd =>
			cmd.label.toLowerCase().includes(searchTerm) ||
			(cmd.description && cmd.description.toLowerCase().includes(searchTerm)) ||
			cmd.command.toLowerCase().includes(searchTerm) ||
			cmd.group.toLowerCase().includes(searchTerm)
		);
		
		// Render search results in a flat list (no hierarchy)
		container.innerHTML = ''; // Clear container
		
		if (searchResults.length === 0) {
			container.innerHTML = `
				<div class="empty-state search-empty-state">
					<div class="icon-container">
						<i class="codicon codicon-search"></i>
					</div>
					<h3 class="title">No matches found</h3>
					<p class="message">No commands match your search term. Try using different keywords or add a new command.</p>
					<div class="action">
						<button class="primary-button" id="addCommandBtnEmpty">
							<i class="codicon codicon-add"></i>
							<span>Add Command</span>
						</button>
					</div>
				</div>
			`;
			
			document.getElementById('addCommandBtnEmpty')?.addEventListener('click', () => {
				vscode.postMessage({ type: 'addCommand' });
			});
			
			return;
		}
		
		// Create a simple list for search results
		const searchResultsList = document.createElement('div');
		searchResultsList.className = 'search-results';
		
		searchResults.forEach(cmd => {
			// Check if command is pinned by comparing properties
			const isPinned = pinnedCommands.some(pinned => isCommandEqual(pinned, cmd));
			const commandItem = createCommandItem(cmd, isPinned);
			searchResultsList.appendChild(commandItem);
		});
		
		container.appendChild(searchResultsList);
		return;
	}
	
	// Build group hierarchy
	const rootGroups = buildGroupHierarchy(commands);
	
	// Sort groups alphabetically
	const sortGroups = (groups) => {
		return groups.sort((a, b) => a.name.localeCompare(b.name));
	};
	
	// Recursive function to render a group and its subgroups
	const renderGroup = (group, level = 0) => {
		const groupDiv = document.createElement('div');
		groupDiv.className = 'group-container';
		groupDiv.dataset.path = group.path;
		groupDiv.dataset.level = level;
		groupDiv.style.marginLeft = level > 0 ? `${level * 8}px` : '0';
		
		// Create group header with indent based on level
		const isExpanded = isSearchResult || expandedGroups.has(group.path);
		const commandCount = countCommands(group);
		
		const groupHeader = document.createElement('div');
		groupHeader.className = isExpanded ? 'group-header expanded' : 'group-header';
		groupHeader.dataset.level = level;
		
		// Add visual cues based on nesting level
		if (level > 0) {
			// Use different styling for each nesting level to improve visibility
			const hue = (level * 30) % 360; // Different hue based on level
			const borderColor = level === 1 ? 'var(--vscode-activityBarBadge-background, #007acc)' : 
				level === 2 ? 'var(--vscode-terminal-ansiGreen, #89d185)' : 
				level === 3 ? 'var(--vscode-terminal-ansiYellow, #ffcc00)' : 
				'var(--vscode-terminal-ansiMagenta, #d670d6)';
			
			groupHeader.style.borderLeftWidth = '3px';
			groupHeader.style.borderLeftStyle = 'solid';
			groupHeader.style.borderLeftColor = borderColor;
			groupHeader.style.backgroundColor = `var(--vscode-sideBarSectionHeader-background, rgba(60, 60, 60, ${0.3 + (level * 0.1)}))`;
			groupHeader.style.opacity = isExpanded ? '1' : '0.95';
		}
		
		groupHeader.innerHTML = `
			<div style="display: flex; align-items: center; width: 100%;">
				<span class="group-icon codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}"
					  style="${level > 0 ? `color: ${level === 1 ? 'var(--vscode-activityBarBadge-background, #007acc)' : 
								 level === 2 ? 'var(--vscode-terminal-ansiGreen, #89d185)' : 
								 level === 3 ? 'var(--vscode-terminal-ansiYellow, #ffcc00)' : 
								 'var(--vscode-terminal-ansiMagenta, #d670d6)'};` : ''}"></span>
				<span class="group-name" style="color: var(--vscode-editor-foreground, #cccccc); ${level > 0 ? 'font-weight: 600;' : 'font-weight: 700;'}">${group.name}</span>
				<span class="group-counter" style="background-color: ${level > 0 ? 
					`var(--vscode-badge-background, rgba(80, 80, 80, 0.4))` : 
					'var(--vscode-activityBarBadge-background, #007acc)'}; color: var(--vscode-badge-foreground, #ffffff);">
					<i class="codicon codicon-terminal" style="margin-right: 4px;"></i>${commandCount}
				</span>
			</div>
		`;
		
		// Toggle group expansion
		groupHeader.addEventListener('click', () => {
			const content = groupDiv.querySelector('.group-content');
			const isCurrentlyExpanded = content.style.maxHeight !== '0px' && content.style.maxHeight !== '';
			const chevronIcon = groupHeader.querySelector('.group-icon');
			
			if (isCurrentlyExpanded) {
				content.style.maxHeight = '0px';
				groupHeader.classList.remove('expanded');
				expandedGroups.delete(group.path);
				
				// Update chevron icon
				chevronIcon.classList.remove('codicon-chevron-down');
				chevronIcon.classList.add('codicon-chevron-right');
			} else {
				content.style.maxHeight = content.scrollHeight + 1000 + 'px'; // Add extra height for nested content
				groupHeader.classList.add('expanded');
				expandedGroups.add(group.path);
				
				// Update chevron icon
				chevronIcon.classList.remove('codicon-chevron-right');
				chevronIcon.classList.add('codicon-chevron-down');
			}
		});
		
		// Create content container for subgroups and commands
		const groupContent = document.createElement('div');
		groupContent.className = 'group-content';
		groupContent.style.maxHeight = isExpanded ? groupContent.scrollHeight + 1000 + 'px' : '0px';
		
		// Add subgroups first
		if (group.subgroups && group.subgroups.length > 0) {
			sortGroups(group.subgroups).forEach(subgroup => {
				groupContent.appendChild(renderGroup(subgroup, level + 1));
			});
		}
		
		// Then add commands
		if (group.commands && group.commands.length > 0) {
			const commandList = document.createElement('div');
			commandList.className = 'command-list';
			
			group.commands.forEach(cmd => {
				const isPinned = pinnedCommands.some(pinned => isCommandEqual(pinned, cmd));
				const commandItem = createCommandItem(cmd, isPinned);
				commandItem.style.paddingLeft = `${24 + level * 16}px`; // Indent commands to match their group level
				commandList.appendChild(commandItem);
			});
			
			groupContent.appendChild(commandList);
		}
		
		groupDiv.appendChild(groupHeader);
		groupDiv.appendChild(groupContent);
		return groupDiv;
	};
	
	// Render all root groups
	sortGroups(rootGroups).forEach(group => {
		container.appendChild(renderGroup(group));
	});
}

// Command deletion confirmation
let commandToDelete = null;

function showDeleteConfirmation(command) {
	// Store the command to delete
	commandToDelete = command;
	
	// Update the confirmation message with the command name
	document.getElementById('deleteConfirmationMessage').textContent = 
		`Are you sure you want to delete the command "${command.label}"?`;
	
	// Show the dialog
	document.getElementById('deleteConfirmationDialog').style.display = 'flex';
}

function hideDeleteConfirmation() {
	document.getElementById('deleteConfirmationDialog').style.display = 'none';
	commandToDelete = null;
}

function confirmDelete() {
	if (commandToDelete) {
		// Send the actual delete message
		vscode.postMessage({
			type: 'removeCommand',
			command: commandToDelete
		});
		
		 // The backend will take care of removing from pinnedCommands and recentCommands
		 // and will send updates via updatePinnedCommands and updateRecentCommands messages
		
		// Hide the dialog
		hideDeleteConfirmation();
	}
}

// Toggle pin status of a command
function togglePin(command, isPinned) {
	vscode.postMessage({
		type: 'togglePinCommand',
		command: command,
		isPinned: isPinned
	});
}
