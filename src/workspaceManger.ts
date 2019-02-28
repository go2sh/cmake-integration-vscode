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
import * as path from 'path';
import { ProjectContext, pickProject, pickTarget, pickClient, pickConfiguration } from './helpers/quickPick';
import { Dependency, DependencySpecification, DependencyResolver } from './helpers/dependencyResolver';

import { CppToolsApi, Version, getCppToolsApi } from 'vscode-cpptools';
import { ConfigurationProvider } from './cpptools/configurationProvider';

import { CMake } from './cmake/cmake';
import { CommandClient } from './cmake/commandClient';
import { CMakeClient } from './cmake/client';
import { Project, Target } from './cmake/model';

export class WorkspaceManager implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _events: vscode.Disposable[] = [];
    private _clients: Map<string, CMake> = new Map<string, CMake>();
    private _workspaceWatcher: Map<vscode.WorkspaceFolder, vscode.FileSystemWatcher> = new Map();

    private _projectItem: vscode.StatusBarItem;
    private _configItem: vscode.StatusBarItem;
    private _targetItem: vscode.StatusBarItem;

    private _currentProject: ProjectContext | undefined;

    private cppProvider: ConfigurationProvider;
    private api: CppToolsApi | undefined;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._events.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            this.onWorkspaceFolderChange(event);
        }));
        this._events.push(vscode.window.onDidChangeActiveTextEditor((event) => {
            this.onChangeActiveEditor(event);
        }));

        // Create a server for files that are already there
        if (vscode.workspace.workspaceFolders) {
            for (let folder of vscode.workspace.workspaceFolders) {
                vscode.workspace.findFiles(new vscode.RelativePattern(folder, "CMakeLists.txt")).then(
                    (uris) => uris.forEach((value) => this.createServer(value, folder)));
                this.watchFolder(folder);
            }
        }

        this._projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
        this._targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
        this._configItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

        this._projectItem.command = "cmake.selectProject";
        this._targetItem.command = "cmake.selectTarget";
        this._configItem.command = "cmake.selectBuildType";

        this.cppProvider = new ConfigurationProvider();
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

    private get currentClient(): CMake | undefined {
        if (this.currentProject) {
            return this.currentProject.client;
        }
        return undefined;
    }

    async registerCppProvider() {
        this.api = await getCppToolsApi(Version.v2);
        if (this.api) {
            this.api.registerCustomConfigurationProvider(this.cppProvider);
        }
    }

    getClientByProjectName(project: string): CMake | undefined {
        for (let client of this._clients.values()) {
            if (client.projects.find((value) => value.name === project)) {
                return client;
            }
        }
        return undefined;
    }

    getProjectContexts(): ProjectContext[] {
        let contexts: ProjectContext[] = [];
        for (const client of this._clients.values()) {
            client.projects.map((value) => contexts.push({
                project: value,
                client: client
            }));
        }
        if (contexts.length > 0) {
            this.onModelChange(contexts[0].client);
        }
        return contexts;
    }

    private onModelChange(e: CMake) {
        if (this.currentProject === undefined) {
            let client: CMake | undefined;
            let projectName: string | undefined;


            projectName = this._context.workspaceState.get("currentProject");
            if (projectName) {
                client = this.getClientByProjectName(projectName);
            }
            if (client === undefined) {
                client = e;
            }

            let project = client.projects.find((value) => value.name === projectName);
            if (project) {
                client.project = project;
            } else {
                project = client.project;
            }

            if (project) {
                this.currentProject = { client: client!, project: project! };
            }
        } else if (this.currentProject && this.currentProject.client === e) {
            if (e.project) {
                this.currentProject.project = e.project;
            } else {
                this.currentProject = undefined;
            }
        }
        this.updateStatusBar();
        if (this.api) {
            this.cppProvider.updateClient(e);
            if (this.cppProvider.isReady) {
                this.api.notifyReady(this.cppProvider);
            }
            // this.api.didChangeCustomBrowseConfiguration(this.cppProvider);
            // this.api.didChangeCustomConfiguration(this.cppProvider);
        }
    }

    private updateStatusBar() {
        if (this.currentClient) {
            if (this.currentClient.project) {
                this._projectItem.text = this.currentClient.project.name;
                if (this.currentClient.target) {
                    this._targetItem.text = this.currentClient.target.name;
                } else {
                    this._projectItem.text = "No Target";
                }
                this._targetItem.show();
            } else {
                this._projectItem.text = "No Project";
                this._targetItem.hide();
            }
            this._projectItem.show();
            this._configItem.text = this.currentClient.configuration.name;
            this._configItem.show();
        } else {
            this._projectItem.hide();
            this._configItem.hide();
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

    private async createServer(uri: vscode.Uri, workspaceFolder?: vscode.WorkspaceFolder) {
        if (uri.scheme !== "file" || this._clients.has(uri.fsPath)) {
            return;
        }

        let sourceFolder = vscode.Uri.file(path.dirname(uri.fsPath));

        let client: CMake;
        try {
            client = new CommandClient(sourceFolder, workspaceFolder!, this._context);
            client.onModelChange((e) => this.onModelChange(e));
            await client.initialize();

            this._clients.set(uri.fsPath, client);
            this.cppProvider.addClient(client);

            if (vscode.workspace.getConfiguration("cmake").get("configureOnStart", true)) {
                try {
                    await client.configure();
                } catch (e) {
                    vscode.window.showErrorMessage("Failed to configure project(" + client.name + "): " + e.message);
                }
            }
        } catch (e) {
            vscode.window.showErrorMessage("Failed to start CMake Client(" + sourceFolder.fsPath + "): " + e.message);
        }
    }

    private deleteServer(uri: vscode.Uri) {
        let client = this._clients.get(uri.fsPath);
        if (client) {
            client.dispose();
            this._clients.delete(uri.fsPath);
            this.cppProvider.deleteClient(client);
        }
        this.updateStatusBar();
    }

    private onChangeActiveEditor(event: vscode.TextEditor | undefined) {

    }

    async configureWorkspace() {
        try {
            await Promise.all([...this._clients.values()].map(async (value) => {
                await value.configure();
            }));
        } catch (e) {
            vscode.window.showErrorMessage(
                "Failed to configure workspace: +" + e.message
            );
        }
    }

    async configureProject(current?: boolean) {
        let client: CMake | undefined;
        if (current) {
            client = this.currentClient;
        } else {
            let projectContext = await pickProject(this.getProjectContexts());
            if (projectContext) {
                client = projectContext.client;
            }
        }
        if (client) {
            try {
                await client.configure();
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
                    return { project: value.name } as Dependency;
                }));
            }
        }

        try {
            let resolver = new DependencyResolver(targetDependencies);
            let buildSteps: Dependency[][] = resolver.resolve(workspaceTargets);
            for (const step of buildSteps) {
                await Promise.all(step.map((value) => {
                    let client = this.getClientByProjectName(value.project);
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
        let client: CMake | undefined;
        let project: Project | undefined;

        if (current) {
            client = this.currentClient;
            if (client) {
                project = client.project;
            }
        } else {
            let projectContext = await pickProject(this.getProjectContexts());
            if (projectContext) {
                client = projectContext.client;
                project = projectContext.project;
            }
        }

        if (!client || !project) {
            return;
        }

        try {
            let targetDependencies = vscode.workspace.getConfiguration("cmake").get<DependencySpecification[]>("targetDependencies", []);
            let resolver = new DependencyResolver(targetDependencies);
            let buildSteps: Dependency[][] = resolver.resolve({ project: project.name } as Dependency);
            for (const step of buildSteps) {
                await Promise.all(step.map((value) => {
                    let client = this.getClientByProjectName(value.project);
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
        let projectContext: ProjectContext | undefined;
        let target: Target | undefined;

        if (current) {
            projectContext = this.currentProject;
            if (projectContext) {
                target = projectContext.client.target;
            }
        } else {
            projectContext = await pickProject(this.getProjectContexts());
            if (projectContext) {
                target = await pickTarget(projectContext);
            }
        }

        if (!projectContext || !target) {
            return;
        }

        try {
            let deps = vscode.workspace.getConfiguration("cmake").get<DependencySpecification[]>("targetDependencies", []);
            let resolver = new DependencyResolver(deps);
            let buildSteps: Dependency[][] = resolver.resolve({ project: projectContext.project.name, target: target.name });
            for (const step of buildSteps) {
                await Promise.all(step.map((value) => {
                    let client = this.getClientByProjectName(value.project);
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
        let client: CMake | undefined;

        if (current) {
            client = this.currentClient;
        } else {
            let project = await pickProject(this.getProjectContexts());
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
        let project = await pickProject(this.getProjectContexts());
        if (project) {
            this.currentProject = project;
            this.currentProject.client.project = project.project;
            this.updateStatusBar();
        }
    }

    async selectTarget() {
        if (this.currentProject === undefined) {
            await this.selectProject();
        }
        if (this.currentProject) {
            let target = await pickTarget(this.currentProject);
            if (target) {
                this.currentProject.client.target = target;
            }
        }
        this.updateStatusBar();
    }

    async selectBuildType() {
        if (this.currentProject === undefined) {
            await this.selectProject();
            await this.selectTarget();
        }
        if (this.currentProject) {
            let config = await pickConfiguration(this.currentProject);
            if (config) {
                await this.currentProject.client.updateConfiguration(config);
                await this.currentProject.client.configure();
            }
        }
        this.updateStatusBar();
    }

    async removeBuildDirectory() {
        let client = await pickClient([...this._clients.values()]);
        if (client) {
            try {
                await client.removeBuildDirectory();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to removce build directory: " + e.message);
            }
        }
    }

    async restartClient(clean?: boolean) {
        let client = await pickClient([...this._clients.values()]);
        if (client && client instanceof CMakeClient) {
            try {
                await client.stop();
                if (clean) {
                    await client.removeBuildDirectory();
                }
                await client.start();
                if (vscode.workspace.getConfiguration("cmake").get("configureOnStart", true)) {
                    try {
                        await client.configure();
                    } catch (e) {
                        vscode.window.showErrorMessage("Failed to configure project(" + client.name + "): " + e.message);
                    }
                }
            } catch (e) {
                vscode.window.showErrorMessage(
                    "Failed to restart CMake Server (" + client.name + "): " + e.message
                );
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