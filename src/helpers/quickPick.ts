/*
 * Copyright 2019 Christoph Seitz
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
 * Handling all quick pick action for clients, projects and targets.
 */
import * as vscode from "vscode";
import * as model from '../cmake/model';
import { CMake } from "../cmake/cmake";

interface CMakeItem extends vscode.QuickPickItem {
    client: CMake;
}

async function pickClient(clients: CMake[]): Promise<CMake | undefined> {

    let clientPick = vscode.window.createQuickPick<CMakeItem>();
    clientPick.items = clients.map((value) => {
        return {
            client: value,
            label: value.name,
            description: value.sourceFolder.fsPath
        } as CMakeItem;
    });
    clientPick.show();

    return new Promise<CMake | undefined>((resolve) => {
        let activeItem: CMakeItem;
        clientPick.onDidChangeSelection((e) => {
            const result = clientPick.activeItems[0];
            if (result) {
                resolve(result.client);
                clientPick.hide();
            }
        });
        clientPick.onDidChangeValue(value => {
            if (activeItem && !value && (clientPick.activeItems.length !== 1 || clientPick.activeItems[0] !== activeItem)) {
                clientPick.activeItems = [activeItem];
            }
        });
        clientPick.onDidAccept((e) => {
            const result = clientPick.activeItems[0];
            if (result) {
                resolve(result.client);
                clientPick.hide();
            }
        });
        clientPick.onDidHide((e) => {
            resolve(undefined);
            clientPick.dispose();
        });
    });
}

interface ProjectContext {
    client: CMake;
    project: model.Project;
}

interface ProjectContextItem extends vscode.QuickPickItem {
    context: ProjectContext;
}


async function pickProject(projects: ProjectContext[]): Promise<ProjectContext | undefined> {
    let projectPick = vscode.window.createQuickPick<ProjectContextItem>();
    projectPick.items = projects.map((value) => {
        return {
            context: value,
            label: value.project.name,
            description: value.client.name
        } as ProjectContextItem;
    });
    projectPick.show();

    return new Promise<ProjectContext | undefined>((resolve) => {
        let activeItem: ProjectContextItem;
        projectPick.onDidChangeSelection((e) => {
            const result = projectPick.activeItems[0];
            if (result) {
                resolve(result.context);
                projectPick.hide();
            }
        });
        projectPick.onDidChangeValue(value => {
            if (activeItem && !value && (projectPick.activeItems.length !== 1 || projectPick.activeItems[0] !== activeItem)) {
                projectPick.activeItems = [activeItem];
            }
        });
        projectPick.onDidAccept((e) => {
            const result = projectPick.activeItems[0];
            if (result) {
                resolve(result.context);
                projectPick.hide();
            }
        });
        projectPick.onDidHide((e) => {
            resolve(undefined);
            projectPick.dispose();
        });
    });
}

interface TargetItem extends vscode.QuickPickItem {
    target: model.Target;
}

async function pickTarget(context: ProjectContext): Promise<model.Target | undefined> {
    let targetPick = vscode.window.createQuickPick<TargetItem>();
    targetPick.items = context.client.projectTargets.map((value) => {
        return {
            target: value,
            label: value.name,
            description: value.type
        };
    });
    targetPick.show();

    return new Promise<model.Target | undefined>((resolve) => {
        let activeItem: TargetItem;
        targetPick.onDidChangeSelection((e) => {
            const result = targetPick.activeItems[0];
            if (result) {
                resolve(result.target);
                targetPick.hide();
            }
        });
        targetPick.onDidChangeValue(value => {
            if (activeItem && !value && (targetPick.activeItems.length !== 1 || targetPick.activeItems[0] !== activeItem)) {
                targetPick.activeItems = [activeItem];
            }
        });
        targetPick.onDidAccept((e) => {
            const result = targetPick.activeItems[0];
            if (result) {
                resolve(result.target);
                targetPick.hide();
            }
        });
        targetPick.onDidHide((e) => {
            resolve(undefined);
            targetPick.dispose();
        });
    });
}

export { ProjectContext, pickProject, pickTarget, pickClient };