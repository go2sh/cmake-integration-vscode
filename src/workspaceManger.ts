import * as vscode from 'vscode';
import * as path from 'path';
import { CMakeClient } from './cmake/client';

export class WorkspaceManager implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _events: vscode.Disposable[] = [];
    private _clients: Map<string, CMakeClient> = new Map<string, CMakeClient>();
    private _workspaceWatcher: Map<vscode.WorkspaceFolder, vscode.FileSystemWatcher> = new Map();

    private _projectItem : vscode.StatusBarItem;
    private _buildTypeItem : vscode.StatusBarItem;
    private _targetItem : vscode.StatusBarItem;

    private _currentProject : string;

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

        this._projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,12);
        this._targetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,11);
        this._buildTypeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,10);

        this._projectItem.command = "cmake-server.selectProject";
        this._targetItem.command = "cmake-server.selectTarget";
        this._buildTypeItem.command = "cmake-server.selectBuildType";

        this._currentProject = this._context.workspaceState.get("currentProject","");
    }

    private get _currentClient() : CMakeClient | undefined {
        for (const a of this._clients.values()) {
            if (a.projects.indexOf(this._currentProject) >= 0) {
                return a;
            }
        }
        return undefined;
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

    private _createServer(uri: vscode.Uri) {
        if (uri.scheme !== "file" || this._clients.has(uri.fsPath)) {
            return;
        }
        let sourcePath = path.dirname(uri.fsPath);
        let buildPath = path.join(sourcePath, vscode.workspace.getConfiguration("cmake-server", uri).get("buildDirectory", "build"));
        let client = new CMakeClient(this._context, sourcePath, buildPath, vscode.workspace.getConfiguration("cmake-server", uri).get("generator","Ninja"));
        this._clients.set(sourcePath, client);
        client.onModelChange((e) => this._onModelChange(e));
    }

    private _onModelChange(e : CMakeClient) {
        if (this._currentClient === undefined) {
            this._currentProject = e.projects[0];
        }
        if (this._currentClient === e) {
            this._updateStatusBar();
        }
    }

    private _watchFolder(folder: vscode.WorkspaceFolder) {
        const pattern = new vscode.RelativePattern(folder, "CMakeLists.txt");
        const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);
        watcher.onDidCreate((value) => this._createServer(value));
        this._workspaceWatcher.set(folder, watcher);
    }

    private _onChangeActiveEditor(event: vscode.TextEditor | undefined) {

    }

    private _onWorkspaceFolderChange(event: vscode.WorkspaceFoldersChangeEvent) {
        event.added.forEach((folder) => this._watchFolder(folder));
        event.removed.forEach((folder) => {
            this._workspaceWatcher.get(folder)!.dispose();
            this._workspaceWatcher.delete(folder);
        });
    }

    configureCurrentProject() {
        if (this._currentClient) {
            this._currentClient.generate();
        }
    }

    buildCurrentTarget() {
        if (this._currentClient) {
            this._currentClient.build();
        }
    }

    async selectProject() {
        let projects : string [] = [];
        for(const client of this._clients.values()) {
            projects = projects.concat(client.projects);
        }
        let project = await vscode.window.showQuickPick(projects,{
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