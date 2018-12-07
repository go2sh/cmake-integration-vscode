import * as vscode from 'vscode';
import { CMakeClient } from './cmake/client';

export class WorkspaceManager implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _events: vscode.Disposable[] = [];
    private _clients: Map<string, CMakeClient> = new Map<string, CMakeClient>();
    private _workspaceWatcher: Map<vscode.WorkspaceFolder, vscode.FileSystemWatcher> = new Map();

    private _projectItem: vscode.StatusBarItem;
    private _buildTypeItem: vscode.StatusBarItem;
    private _targetItem: vscode.StatusBarItem;

    private _currentProject: string;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._events.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            this._onWorkspaceFolderChange(event);
        }));
        this._events.push(vscode.window.onDidChangeActiveTextEditor((event) => {
            this._onChangeActiveEditor(event);
        }));

        // Create a server for files that are already there
        vscode.workspace.findFiles("CMakeLists.txt").then(
            (uris) => uris.forEach((value) => this._createServer(value)));

        for (let folder of vscode.workspace.workspaceFolders || []) {
            this._watchFolder(folder);
        }

        this._projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
        this._targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
        this._buildTypeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

        this._projectItem.command = "cmake-server.selectProject";
        this._targetItem.command = "cmake-server.selectTarget";
        this._buildTypeItem.command = "cmake-server.selectBuildType";

        this._currentProject = this._context.workspaceState.get("currentProject", "");
    }

    private get _currentClient(): CMakeClient | undefined {
        for (const a of this._clients.values()) {
            if (a.projects.indexOf(this._currentProject) >= 0) {
                return a;
            }
        }
        if (this._clients.size > 0) {
            let client = this._clients.values().next().value;
            this._currentProject = client.project;
            return client;
        }
        return undefined;
    }

    private get _projects(): string[] {
        let projects: string[] = [];
        for (let client of this._clients.values()) {
            projects = projects.concat(client.projects);
        }
        return projects;
    }

    private _getClientByProject(project: string): CMakeClient | undefined {
        for (let client of this._clients.values()) {
            if (client.projects.find((value) => value === project)) {
                return client;
            }
        }
        return undefined;
    }

    private _onModelChange(e: CMakeClient) {
        if (this._currentClient === undefined) {
            this._currentProject = e.projects[0];
        }
        if (this._currentClient === e) {
            this._updateStatusBar();
        }
    }

    private _updateStatusBar() {
        if (this._currentClient) {
            this._projectItem.text = this._currentClient.project;
            this._projectItem.show();
            this._buildTypeItem.text = this._currentClient.buildType;
            this._buildTypeItem.show();
            this._targetItem.text = this._currentClient.target;
            this._targetItem.show();
        } else {
            this._projectItem.hide();
            this._buildTypeItem.hide();
            this._targetItem.hide();
        }
    }

    private _onWorkspaceFolderChange(event: vscode.WorkspaceFoldersChangeEvent) {
        event.added.forEach((folder) => {
            vscode.workspace.findFiles(new vscode.RelativePattern(folder,"CMakeLists.txt")).then(
                (uris) => uris.forEach((value) => this._createServer(value)));
            this._watchFolder(folder);
        });
        event.removed.forEach((folder) => {
            let paths = [...this._clients.keys()];
            for (let path of paths) {
                if (path.startsWith(folder.uri.fsPath)) {
                    this._deleteServer(vscode.Uri.file(path));
                }
            }
            this._workspaceWatcher.get(folder)!.dispose();
            this._workspaceWatcher.delete(folder);
        });
    }

    private _watchFolder(folder: vscode.WorkspaceFolder) {
        const pattern = new vscode.RelativePattern(folder, "CMakeLists.txt");
        const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);
        watcher.onDidCreate((value) => this._createServer(value));
        watcher.onDidDelete((value) => this._deleteServer(value));
        this._workspaceWatcher.set(folder, watcher);
    }

    private _createServer(uri: vscode.Uri) {
        if (uri.scheme !== "file" || this._clients.has(uri.fsPath)) {
            return;
        }

        let client = new CMakeClient(uri, this._context);
        this._clients.set(uri.fsPath, client);
        client.onModelChange((e) => this._onModelChange(e));
        client.start().catch((e) => {
            vscode.window.showErrorMessage("Failed to start cmake server: " + e.message);
        });
    }
    
    private _deleteServer(uri : vscode.Uri) {
        let client = this._clients.get(uri.fsPath);
        if (client) {
            client.dispose();
            this._clients.delete(uri.fsPath);
        }
        this._updateStatusBar();
    }

    private _onChangeActiveEditor(event: vscode.TextEditor | undefined) {

    }

    async configureCurrentProject() {
        if (this._currentClient) {
            await this._currentClient.generate();
        }
    }

    async buildCurrentTarget() {
        if (this._currentClient) {
            try {
                await this._currentClient.build();
            } catch (e) {
                vscode.window.showErrorMessage("Failed to build current target: " + e.message);
            }
        }
    }

    async buildTarget() {
        let project: string | undefined;
        let client: CMakeClient | undefined;

        project = await vscode.window.showQuickPick(this._projects);
        if (project === undefined) {
            return;
        }

        client = this._getClientByProject(project);
        if (client === undefined) {
            return;
        }

        let target = await vscode.window.showQuickPick(client.targets);
        await client.build(target);
    }

    async selectProject() {
        let projects: string[] = [];
        for (const client of this._clients.values()) {
            projects = projects.concat(client.projects);
        }
        let project = await vscode.window.showQuickPick(projects, {
            placeHolder: this._currentProject
        });
        if (project) {
            this._currentProject = project;
            this._updateStatusBar();
        }
        this._updateStatusBar();
    }

    async selectTarget() {
        if (this._currentClient === undefined) {
            await this.selectProject();
        }
        if (this._currentClient) {
            let target = await vscode.window.showQuickPick(this._currentClient.targets, {
                placeHolder: this._currentClient.target
            });
            if (target) {
                this._currentClient.target = target;
            }
        }
        this._updateStatusBar();
    }

    async selectBuildType() {
        if (this._currentClient === undefined) {
            await this.selectProject();
            await this.selectTarget();
        }
        if (this._currentClient) {
            let buildType = await vscode.window.showQuickPick(this._currentClient.buildTypes, {
                placeHolder: this._currentClient.buildType
            });
            if (buildType) {
                this._currentClient.buildType = buildType;
            }
        }
        this._updateStatusBar();
    }

    dispose(): void {
        this._events.forEach((item) => item.dispose());
        this._clients.forEach((value, key) => value.dispose());
        for (const watcher of this._workspaceWatcher.values()) {
            watcher.dispose();
        }
    }
}