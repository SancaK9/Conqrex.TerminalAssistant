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
	
	// Handle search input
	searchInput.addEventListener('input', () => {
		const searchTerm = searchInput.value;
		clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
		
		if (searchTerm) {
			vscode.postMessage({ type: 'search', searchTerm });
			// Save search state when user types
			vscode.postMessage({ type: 'saveSearchState', searchTerm });
		} else {
			renderCommands(allCommands);
		}
	});
	
	// Clear search
	clearSearchBtn.addEventListener('click', () => {
		searchInput.value = '';
		clearSearchBtn.style.display = 'none';
		renderCommands(allCommands);
		searchInput.focus();
		// Clear saved search state
		vscode.postMessage({ type: 'saveSearchState', searchTerm: '' });
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
			searchInput.value = message.searchTerm;
			clearSearchBtn.style.display = message.searchTerm ? 'block' : 'none';
			
			if (message.searchTerm) {
				vscode.postMessage({ type: 'search', searchTerm: message.searchTerm });
				// Hide pinned and recent sections during search
				document.getElementById('pinnedCommandsSection').style.display = 'none';
				document.getElementById('recentCommandsSection').style.display = 'none';
			} else {
				// Show pinned and recent sections if search is cleared
				document.getElementById('pinnedCommandsSection').style.display = 'block';
				document.getElementById('recentCommandsSection').style.display = 'block';
			}
			break;
			
		case 'updatePinnedCommands':
			pinnedCommands = message.pinnedCommands || [];
			renderPinnedCommands(pinnedCommands);
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
			<div class="empty-tab-message">
				<i class="codicon codicon-pin"></i>
				<h3>No Pinned Commands</h3>
				<p>Pin your favorite commands for quick access by clicking the pin icon on any command.</p>
			</div>
		`;
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
			<div class="empty-tab-message">
				<i class="codicon codicon-history"></i>
				<h3>No Recent Commands</h3>
				<p>Commands you execute will appear here for quick access.</p>
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
	
	// Execute on click of the command item
	commandItem.addEventListener('click', () => {
		vscode.postMessage({
			type: 'executeCommand',
			command: cmd
		});
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
			<div class="no-commands">
				No commands found.
				<button class="add-button" id="addCommandBtnEmpty">
					Add Command
				</button>
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
				<div class="no-commands">
					No commands match your search.
					<button class="add-button" id="addCommandBtnEmpty">
						Add Command
					</button>
				</div>
			`;
			
			document.getElementById('addCommandBtnEmpty').addEventListener('click', () => {
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
		groupDiv.style.marginLeft = level > 0 ? `${level * 8}px` : '0';
		
		// Create group header with indent based on level
		const isExpanded = isSearchResult || expandedGroups.has(group.path);
		const commandCount = countCommands(group);
		
		const groupHeader = document.createElement('div');
		groupHeader.className = isExpanded ? 'group-header expanded' : 'group-header';
		
		// Add visual cues based on nesting level
		if (level > 0) {
			groupHeader.style.borderLeftColor = 'var(--vscode-activityBarBadge-background, #007acc)';
			groupHeader.style.borderLeftWidth = '2px';
			groupHeader.style.borderLeftStyle = 'solid';
			groupHeader.style.backgroundColor = 'var(--vscode-sideBarSectionHeader-background, rgba(128, 128, 128, 0.2))';
			groupHeader.style.opacity = isExpanded ? '1' : '0.85';
		}
		
		groupHeader.innerHTML = `
			<div style="display: flex; align-items: center; width: 100%;">
				<span class="group-icon codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}"
					  style="${level > 0 ? 'color: var(--vscode-activityBarBadge-background, #007acc);' : ''}"></span>
				<span class="group-name">${group.name}</span>
				<span class="group-counter">
					<i class="codicon codicon-terminal"></i>${commandCount}
				</span>
			</div>
		`;
		
		// Toggle group expansion
		groupHeader.addEventListener('click', () => {
			const content = groupDiv.querySelector('.group-content');
			const isCurrentlyExpanded = content.style.maxHeight !== '0px' && content.style.maxHeight !== '';
			
			if (isCurrentlyExpanded) {
				content.style.maxHeight = '0px';
				groupHeader.classList.remove('expanded');
				expandedGroups.delete(group.path);
			} else {
				content.style.maxHeight = content.scrollHeight + 1000 + 'px'; // Add extra height for nested content
				groupHeader.classList.add('expanded');
				expandedGroups.add(group.path);
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
