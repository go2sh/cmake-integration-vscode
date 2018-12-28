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
 * Worksapce manager handling CMake clients
 */
import * as vscode from 'vscode';
import { CMakeClient } from './cmake/client';
import { Dependency, DependencySpecification, DependencyResolver } from './helpers/dependencyResolver';

interface ProjectContext {
    client: CMakeClient;
    project: string;
}

export class WorkspaceManager implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _events: vscode.Disposable[] = [];
    private _clients: Map<string, CMakeClient> = new Map<string, CMakeClient>();
    private _workspaceWatcher: Map<vscode.WorkspaceFolder, vscode.FileSystemWatcher> = new Map();

    private _projectItem: vscode.StatusBarItem;
    private _buildTypeItem: vscode.StatusBarItem;
    private _targetItem: vscode.StatusBarItem;

    private _currentProject: ProjectContext | undefined;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._events.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            this.onWorkspaceFolderChange(event);
        }));
        this._events.push(vscode.window.onDidChangeActiveTextEditor((event) => {
            this.onChangeActiveEditor(event);
        }));

        // Create a server for files that are already there
        vscode.workspace.findFiles("CMakeLists.txt").then(
            (uris) => uris.forEach((value) => this.createServer(value)));

        for (let folder of vscode.workspace.workspaceFolders || []) {
            this.watchFolder(folder);
        }

        this._projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
        this._targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
        this._buildTypeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

        this._projectItem.command = "cmake.selectProject";
        this._targetItem.command = "cmake.selectTarget";
        this._buildTypeItem.command = "cmake.selectBuildType";
    }

    private get currentProject() {
        return this._currentProject;
    }
    private set currentProject(value: ProjectContext | undefined) {
        this._currentProject = value;
        if (value) {
            this._context.workspaceState.update("currentProject", value.project);
        }
    }

    private get currentClient(): CMakeClient | undefined {
        if (this.currentProject) {
            return this.currentProject.client;
        }
        return undefined;
    }

    getClientByProject(project: string): CMakeClient | undefined {
        for (let client of this._clients.values()) {
            if (client.projects.find((value) => value === project)) {
                return client;
            }
        }
        return undefined;
    }

    private onModelChange(e: CMakeClient) {
        if (this.currentProject === undefined) {
            let client: CMakeClient | undefined;
            let project: string | undefined;

            // Try to load workspace state
            project = this._context.workspaceState.get("currentProject");
            if (project) {
                client = this.getClientByProject(project);
            }
            // Load default project
            if (client === undefined) {
                client = e;
                project = e.project;
            }
            this.currentProject = { client: client!, project: project! };
        } else if (this.currentProject && this.currentProject.client === e) {
            this.currentProject.project = e.project;
        }
        this.updateStatusBar();
    }

    private updateStatusBar() {
        if (this.currentClient) {
            this._projectItem.text = this.currentClient.project;
            this._projectItem.show();
            this._buildTypeItem.text = this.currentClient.buildType;
            this._buildTypeItem.show();
            this._targetItem.text = this.currentClient.target;
            this._targetItem.show();
        } else {
            this._projectItem.hide();
            this._buildTypeItem.hide();
            this._targetItem.hide();
        }
    }

    private onWorkspaceFolderChange(event: vscode.WorkspaceFoldersChangeEvent) {
        event.added.forEach((folder) => {
            vscode.workspace.findFiles(new vscode.RelativePattern(folder, "CMakeLists.txt")).then(
                (uris) => uris.forEach((value) => this.createServer(value)));
            this.watchFolder(folder);
        });
        event.removed.forEach((folder) => {
            let paths = [...this._clients.keys()];
            for (let path of paths) {
                if (path.startsWith(folder.uri.fsPath)) {
                    this.deleteServer(vscode.Uri.file(path));
                }
            }
            this._workspaceWatcher.get(folder)!.dispose();
            this._workspaceWatcher.delete(folder);
        });
    }

    private watchFolder(folder: vscode.WorkspaceFolder) {
        const pattern = new vscode.RelativePattern(folder, "CMakeLists.txt");
        const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);
        watcher.onDidCreate((value) => this.createServer(value));
        watcher.onDidDelete((value) => this.deleteServer(value));
        this._workspaceWatcher.set(folder, watcher);
    }

    private async createServer(uri: vscode.Uri) {
        if (uri.scheme !== "file" || this._clients.has(uri.fsPath)) {
            return;
        }

        let client = new CMakeClient(uri, this._context);
        client.onModelChange((e) => this.onModelChange(e));

        this._clients.set(uri.fsPath, client);

        try {
            await client.start();
            if (vscode.workspace.getConfiguration("cmake").get("configureOnStart", true)) {
                try {
                    await client.generate();
                    await client.updateModel();
                } catch (e) {
                    vscode.window.showErrorMessage("Failed to configure project(" + client.name + "): " + e.message);
                }
            }
        } catch (e) {
            vscode.window.showErrorMessage("Failed to start CMake(" + client.name + "): " + e.message);
        }
    }

    private deleteServer(uri: vscode.Uri) {
        let client = this._clients.get(uri.fsPath);
        if (client) {
            client.dispose();
            this._clients.delete(uri.fsPath);
        }
        this.updateStatusBar();
    }

    private onChangeActiveEditor(event: vscode.TextEditor | undefined) {

    }

    private async pickProject(): Promise<ProjectContext | undefined> {
        let projects: ProjectContext[] = [];
        for (const client of this._clients.values()) {
            projects = projects.concat(client.projects.map((value) => {
                return { client: client, project: value } as ProjectContext;
            }));
        }

        interface ProjectContextItem extends vscode.QuickPickItem {
            context: ProjectContext;
        }

        let projectPick = vscode.window.createQuickPick<ProjectContextItem>();
        projectPick.items = projects.map((value) => {
            return {
                context: value,
                label: value.project,
                description: value.client.name
            } as ProjectContextItem;
        });
        projectPick.show();

        return new Promise<ProjectContext | undefined>((resolve) => {
            let accepted = false;
            projectPick.onDidAccept((e) => {
                accepted = true;
                projectPick.hide();
                resolve(projectPick.selectedItems[0].context);
            });
            projectPick.onDidHide((e) => {
                if (!accepted) {
                    resolve(undefined);
                }
            });
        });
    }

    private async pickClient(): Promise<CMakeClient | undefined> {
        let clients: CMakeClient[] = new Array(...this._clients.values());

        interface CMakeClientItem extends vscode.QuickPickItem {
            client: CMakeClient;
        }

        let clientPick = vscode.window.createQuickPick<CMakeClientItem>();
        clientPick.items = clients.map((value) => {
            return {
                client: value,
                label: value.name,
                description: value.sourceDirectory
            } as CMakeClientItem;
        });
        clientPick.show();

        return new Promise<CMakeClient | undefined>((resolve) => {
            let accepted = false;
            clientPick.onDidAccept((e) => {
                accepted = true;
                clientPick.hide();
                resolve(clientPick.selectedItems[0].client);
            });
            clientPick.onDidHide((e) => {
                if (!accepted) {
                    resolve(undefined);
                }
            });
        });
    }

    async configureWorkspace() {
        try {
            await Promise.all([...this._clients.values()].map((value) => {
                value.configure().then(() => value.generate()).then(() => value.updateModel());
            }));
        } catch (e) {
            vscode.window.showErrorMessage("Failed to configure workspace: " + e.message);
        }
    }

    async configureProject(current?: boolean) {
        let client : CMakeClient | undefined;
        if (current) {
            client = this.currentClient;
        } else {
            let projectContext = await this.pickProject();
            if (projectContext) {
                client = projectContext.client;
            }
        }
        if (client) {
            try {
                await client.configure();
                await client.generate();
                await client.updateModel();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to configure project(" + client.project + "): " + e.message);
            }
        }
    }

    async buildWorkspace() {
        let workspaceTargets = vscode.workspace.getConfiguration("cmake").get<Dependency[]>("workspaceTargets", []);
        let targetDependencies = vscode.workspace.getConfiguration("cmake").get<DependencySpecification[]>("targetDependencies", []);

        // If no workspace targets are defined, use all projects
        if (workspaceTargets.length === 0) {
            for (const client of this._clients.values()) {
                workspaceTargets.push(...client.projects.map((value) => {
                    return { project: value } as Dependency;
                }));
            }
        }

        try {
            let resolver = new DependencyResolver(targetDependencies);
            let buildSteps: Dependency[][] = resolver.resolve(workspaceTargets);
            for (const step of buildSteps) {
                await Promise.all(step.map((value) => {
                    let client = this.getClientByProject(value.project);
                    if (client) {
                        client.build(value.target);
                    }
                }));
            }
        } catch (e) {
            vscode.window.showErrorMessage("Failed to build workspace: " + e.message);
        }
    }

    async buildProject(current: boolean = false) {
        let client: CMakeClient | undefined;
        let project: string | undefined;

        if (current) {
            client = this.currentClient;
            if (client) {
                project = client.project;
            }
        } else {
            let projectContest = await this.pickProject();
            if (projectContest) {
                client = projectContest.client;
                project = projectContest.project;
            }
        }

        if (!client) {
            return;
        }

        try {
            let targetDependencies = vscode.workspace.getConfiguration("cmake").get<DependencySpecification[]>("targetDependencies", []);
            let resolver = new DependencyResolver(targetDependencies);
            let buildSteps: Dependency[][] = resolver.resolve({ project: project } as Dependency);
            for (const step of buildSteps) {
                await Promise.all(step.map((value) => {
                    let client = this.getClientByProject(value.project);
                    if (client) {
                        client.build(value.target);
                    }
                }));
            }
        } catch (e) {
            vscode.window.showErrorMessage("Failed to build project \"" + project + "\": " + e.message);
        }
    }

    async buildTarget(current: boolean = false) {
        let client: CMakeClient | undefined;
        let target: string | undefined;

        if (current) {
            client = this.currentClient;
            if (client) {
                target = client.target;
            }
        } else {
            let project = await this.pickProject();
            if (project) {
                client = project.client;
                target = await vscode.window.showQuickPick(project.client.targets);
            }
        }

        if (!client) {
            return;
        }

        try {
            let deps = vscode.workspace.getConfiguration("cmake").get<DependencySpecification[]>("targetDependencies", []);
            let resolver = new DependencyResolver(deps);
            let buildSteps: Dependency[][] = resolver.resolve({ project: client.project, target: target });
            for (const step of buildSteps) {
                await Promise.all(step.map((value) => {
                    let client = this.getClientByProject(value.project);
                    if (client) {
                        client.build(value.target);
                    }
                }));
            }
        } catch (e) {
            vscode.window.showErrorMessage("Failed to build target \"" + target + "\": " + e.message);
        }
    }

    async cleanWorkspace() {
        try {
            for (const client of this._clients.values()) {
                await client.build("clean");
            }
        } catch (e) {
            vscode.window.showErrorMessage("Failed to clean workspace: " + e.message);
        }
    }

    async cleanProject(current?: boolean) {
        let client: CMakeClient | undefined;

        if (current) {
            client = this.currentClient;
        } else {
            let project = await this.pickProject();
            if (project) {
                client = project.client;
            }
        }

        if (!client) {
            return;
        }

        try {
            await client.build("clean");
        } catch (e) {
            vscode.window.showErrorMessage("Failed to clean project \"" + client.project + "\": " + e.message);
        }
    }

    async selectProject() {
        let project = await this.pickProject();
        if (project) {
            this.currentProject = project;
            this.updateStatusBar();
        }
    }

    async selectTarget() {
        if (this.currentClient === undefined) {
            await this.selectProject();
        }
        if (this.currentClient) {
            let target = await vscode.window.showQuickPick(this.currentClient.targets, {
                placeHolder: this.currentClient.target
            });
            if (target) {
                this.currentClient.target = target;
            }
        }
        this.updateStatusBar();
    }

    async selectBuildType() {
        if (this.currentClient === undefined) {
            await this.selectProject();
            await this.selectTarget();
        }
        if (this.currentClient) {
            let buildType = await vscode.window.showQuickPick(this.currentClient.buildTypes, {
                placeHolder: this.currentClient.buildType
            });
            if (buildType) {
                this.currentClient.buildType = buildType;
            }
        }
        this.updateStatusBar();
    }

    async removeBuildDirectory() {
        let client = await this.pickClient();
        if (client) {
            try {
                await client.removeBuildDirectory();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to removce build directory: " + e.message);
            }
        }
    }

    async restartClient(clean?: boolean) {
        let client = await this.pickClient();
        if (client) {
            try {
                await client.stop();
                if (clean) {
                    await client.removeBuildDirectory();
                }
                await client.start();
                if (vscode.workspace.getConfiguration("cmake").get("configureOnStart", true)) {
                    try {
                        await client.generate();
                        await client.updateModel();
                    } catch (e) {
                        vscode.window.showErrorMessage("Failed to configure project(" + client.name + "): " + e.message);
                    }
                }
            } catch (e) {
                vscode.window.showErrorMessage("Failed to restart CMake: " + e.message);
            }
        }
    }

    dispose(): void {
        this._events.forEach((item) => item.dispose());
        this._clients.forEach((value, key) => value.dispose());
        for (const watcher of this._workspaceWatcher.values()) {
            watcher.dispose();
        }
    }
}