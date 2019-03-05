/*
 * Copyright 2018 Christoph Seitz
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/*
 * Extension main
 */
'use strict';
import * as vscode from 'vscode';
import { WorkspaceManager } from './workspaceManger';


let manager: WorkspaceManager;
let disposables: vscode.Disposable[];

export async function activate(context: vscode.ExtensionContext) {
    disposables = [];
    manager = new WorkspaceManager(context);

    /* Configure commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.configureProject",
            async () => await manager.configureProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.configureCurrentProject",
            async () => await manager.configureProject(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.configureWorkspace",
            async () => await manager.configureWorkspace()
        )
    );

    /* clean commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.cleanProject",
            async () => await manager.cleanProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.cleanCurrentProject",
            async () => await manager.cleanProject(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.cleanWorkspace",
            async () => await manager.cleanWorkspace()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.removeBuildDirectory",
            async () => await manager.removeBuildDirectory()
        )
    );

    /* Build commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.buildTarget",
            async () => await manager.buildTarget()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.buildCurrentTarget",
            async () => await manager.buildTarget(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.buildProject",
            async () => await manager.buildProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.buildCurrentProject",
            async () => await manager.buildProject(true)
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.buildWorkspace",
            async () => await manager.buildWorkspace()
        )
    );

    /* Select commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.selectProject",
            async () => await manager.selectProject()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.selectTarget",
            async () => await manager.selectTarget()
        )
    );
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.selectConfiguration",
            async () => await manager.selectConfiguration()
        )
    );

    /* Server commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.cleanRestartClient",
            async () => await manager.restartClient(true)
        )
    );

    /* Configuration commands */
    disposables.push(
        vscode.commands.registerCommand(
            "cmake.editConfiguration",
            async () => await manager.editConfiguration()
        )
    );

    await manager.registerCppProvider();
}

// this method is called when your extension is deactivated
export function deactivate() {
    manager.dispose();
    disposables.forEach((value) => value.dispose());
}