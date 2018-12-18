'use strict';
import * as vscode from 'vscode';

import { WorkspaceManager } from './workspaceManger';

let manager: WorkspaceManager;
let disposables: vscode.Disposable[];

export function activate(context: vscode.ExtensionContext) {
    manager = new WorkspaceManager(context);
    disposables = [];

    /* Configure commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.configureProject",
            async () => await manager.configureProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.configureCurrentProject", 
            async () => await manager.configureProject(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.configureWorkspace", 
            async () => await manager.configureWorkspace()
        )
    );

    /* clean commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.cleanProject",
            async () => await manager.cleanProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.cleanCurrentProject", 
            async () => await manager.cleanProject(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.cleanWorkspace", 
            async () => await manager.cleanWorkspace()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.removeBuildDirectory",
            async () => await manager.removeBuildDirectory()
        )
    );

    /* Build commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.buildTarget",
            async () => await manager.buildTarget()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.buildCurrentTarget", 
            async () => await manager.buildTarget(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.buildProject",
            async () => await manager.buildProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.buildWorkspace",
            async () => await manager.buildWorkspace()
        )
    );

    /* Select commands */
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

    /* Server commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake-server.cleanRestartClient",
            async () => await manager.restartClient(true)
        )
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
    manager.dispose();
    disposables.forEach((value) => value.dispose());
}