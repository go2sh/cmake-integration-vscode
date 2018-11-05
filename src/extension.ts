'use strict';
import * as vscode from 'vscode';

import { WorkspaceManager } from './workspaceManger';

let manager: WorkspaceManager;
let disposables: vscode.Disposable[];

export function activate(context: vscode.ExtensionContext) {
    manager = new WorkspaceManager(context);
    disposables = [];

    disposables.push(vscode.commands.registerCommand("cmake-server.configureCurrentProject", () => {
        manager.configureCurrentProject();
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
    manager.dispose();
    disposables.forEach((value) => value.dispose());
}