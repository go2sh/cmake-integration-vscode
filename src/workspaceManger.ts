import * as vscode from 'vscode';
import * as path from 'path';
import { CMakeClient } from './cmake/client';

export class WorkspaceManager implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _events: vscode.Disposable[] = [];
    private _clients: Map<string, CMakeClient> = new Map<string, CMakeClient>();

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

        let fsEvent = vscode.workspace.createFileSystemWatcher("**/CMakeLists.txt", false, true, true);
        fsEvent.onDidCreate((value) => this._createServer(value));
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

    private _onChangeActiveEditor(event: vscode.TextEditor | undefined) {

    }

    private _onWorkspaceFolderChange(event: vscode.WorkspaceFoldersChangeEvent) {

    }

    configureCurrentProject() {
        this._clients.values().next().value.configure();
    }

    dispose(): void {
        this._events.forEach((item) => item.dispose());
        this._clients.forEach((value, key) => value.dispose());
    }
}