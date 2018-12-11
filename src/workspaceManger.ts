import * as vscode from 'vscode';
import { CMakeClient } from './cmake/client';

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

        this._projectItem.command = "cmake-server.selectProject";
        this._targetItem.command = "cmake-server.selectTarget";
        this._buildTypeItem.command = "cmake-server.selectBuildType";
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

    private getClientByProject(project: string): CMakeClient | undefined {
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
        try {
            await client.start();
            this._clients.set(uri.fsPath, client);
        } catch (e) {
            vscode.window.showErrorMessage("Failed to start cmake server: " + e.message);
        }
        if (vscode.workspace.getConfiguration("cmake-server").get("configureOnStart", true)) {
            try {
                await client.generate();
                await client.updateModel();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to configure project: " + e.message);
            }
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

    async configureProject() {

    }

    async configureCurrentProject() {
        if (this.currentClient) {
            try {
                await this.currentClient.configure();
                await this.currentClient.generate();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to configure project: " + e.message);
            }
        }
    }

    async configureAllProjects() {

    }

    async restartClient(clean?: boolean) {
        if (this.currentClient) {
            try {
                await this.currentClient.stop();
                if (clean) {
                    await this.currentClient.removeBuildDirectory();
                }
                await this.currentClient.start();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to restart CMake: " + e.message);
            }
        }
    }

    async buildTarget() {
        let project = await this.pickProject();
        if (project === undefined) {
            return;
        }

        let target = await vscode.window.showQuickPick(project.client.targets);
        try {
            await project.client.build(target);
        } catch (e) {
            vscode.window.showErrorMessage("Failed to build target: " + e.message);
        }
    }

    async buildCurrentTarget() {
        if (this.currentClient) {
            try {
                await this.currentClient.build(this.currentClient.target);
            } catch (e) {
                vscode.window.showErrorMessage("Failed to build current target: " + e.message);
            }
        }
    }

    async buildAllProjects() {
        try {
            await Promise.all(Array.from(this._clients.values()).map((value) => value.build()));
        } catch(e) {
            vscode.window.showErrorMessage("Failed to build all: " + e.message);
        }
    }

    async cleanProject() {

    }

    async cleanCurrentProject() {

    }

    async cleanAllProjects() {

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

    dispose(): void {
        this._events.forEach((item) => item.dispose());
        this._clients.forEach((value, key) => value.dispose());
        for (const watcher of this._workspaceWatcher.values()) {
            watcher.dispose();
        }
    }
}