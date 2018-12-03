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
    disposables.push(vscode.commands.registerCommand("cmake-server.buildCurrentTarget", () => {
        manager.buildCurrentTarget();
    }));
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.selectProject", 
            async () => await manager.selectProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.selectTarget",
            async () => await manager.selectTarget()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.selectBuildType",
            async () => await manager.selectBuildType()
        )
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
    manager.dispose();
    disposables.forEach((value) => value.dispose());
}