import * as vscode from 'vscode';
import * as path from 'path';
import { CMakeClient } from './cmake/client';

export class WorkspaceManager implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _events: vscode.Disposable[] = [];
    private _clients: Map<string, CMakeClient> = new Map<string, CMakeClient>();
    private _workspaceWatcher: Map<vscode.WorkspaceFolder, vscode.FileSystemWatcher> = new Map();

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
    }

    private _createServer(uri: vscode.Uri) {
        if (uri.scheme !== "file" || this._clients.has(uri.fsPath)) {
            return;
        }
        let sourcePath = path.dirname(uri.fsPath);
        let buildPath = path.join(sourcePath, vscode.workspace.getConfiguration("cmake-server", uri).get("buildDirectory", "build"));
        let client = new CMakeClient(this._context, sourcePath, buildPath, "Visual Studio 15 2017");
        this._clients.set(sourcePath, client);
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
        this._clients.values().next().value.configure();
    }

    dispose(): void {
        this._events.forEach((item) => item.dispose());
        this._clients.forEach((value, key) => value.dispose());
        for (const watcher of this._workspaceWatcher.values()) {
            watcher.dispose();
        }
    }
}