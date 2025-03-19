import * as vscode from 'vscode';
import { CommandsTreeProvider } from './providers/commandsTreeProvider';

export class TerminalCommandsView {
    private treeView: vscode.TreeView<any>;
    private searchBox: vscode.InputBox;
    private treeProvider: CommandsTreeProvider;

    constructor(context: vscode.ExtensionContext, treeProvider: CommandsTreeProvider) {
        this.treeProvider = treeProvider;

        // Create tree view
        this.treeView = vscode.window.createTreeView('terminalCommands', {
            treeDataProvider: treeProvider,
            showCollapseAll: true // Enable the built-in collapse all button instead
        });
        context.subscriptions.push(this.treeView);

        // Create search box
        this.searchBox = vscode.window.createInputBox();
        this.searchBox.placeholder = "Search commands...";

        // Handle search input
        this.searchBox.onDidChangeValue(text => {
            this.treeProvider.setSearchTerm(text);
        });

        // Clear search when it loses focus
        this.searchBox.onDidHide(() => {
            if (this.searchBox.value) {
                this.searchBox.value = '';
                this.treeProvider.setSearchTerm('');
            }
        });

        // Register command to toggle search
        const searchDisposable = vscode.commands.registerCommand('terminalAssistant.searchCommands', () => {
            this.searchBox.show();
        });
        context.subscriptions.push(searchDisposable);
    }
}