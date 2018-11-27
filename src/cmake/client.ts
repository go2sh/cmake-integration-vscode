import * as vscode from 'vscode';
import * as net from 'net';
import * as child_process from 'child_process';
import * as process from 'process';
import * as os from 'os';
import * as path from 'path';
import { CMakeServer, createCMakeServer } from './server';
import * as protocol from './protocol';

enum ServerState {
    STOPPED,
    CONNECTED,
    RUNNING,
    CONFIGURED,
    GENERATED
}

export class CMakeClient implements vscode.Disposable {

   // private _folder: vscode.WorkspaceFolder;
    private _sourceDirectory: string;
    private _buildDirectory: string;
    private _generator: string;
    private _context: vscode.ExtensionContext;

    private _process: child_process.ChildProcess;
    private _socket: net.Socket;
    private _server: CMakeServer;

    private _model: protocol.CodeModel | undefined;
    private _state: ServerState = ServerState.STOPPED;

    private _console : vscode.OutputChannel;

    private _onModelChange : vscode.EventEmitter<CMakeClient> = new vscode.EventEmitter();
    readonly onModelChange : vscode.Event<CMakeClient> = this._onModelChange.event;

    constructor(
        context: vscode.ExtensionContext,
        //folder: vscode.WorkspaceFolder,
        sourceDirectory: string,
        buildDirectory: string,
        generator: string
    ) {
        this._context = context;
        //this._folder = {name: "asd", uri: vscode.Uri.parse(""), index: 0};//folder;
        this._sourceDirectory = sourceDirectory.replace(/\\/g,"/");
        this._buildDirectory = buildDirectory.replace(/\\/g,"/");
        this._generator = generator;

        this._project = this._context.workspaceState.get(this.name + "-project", "");
        this._target = this._context.workspaceState.get(this._project + "-target","");
        this._buildType = this._context.workspaceState.get(this._project + "-buildType", "");

        this._console = vscode.window.createOutputChannel("CMake ("+this.name+")");
        this._process = child_process.execFile("cmake", ["-E", "server", "--pipe=" + this.pipeName, "--experimental"]);
        this._socket = new net.Socket();
        this._server = createCMakeServer(this._socket, this._socket);
        this._connectServer();
    }

    async configure() {
        if (this._state < ServerState.RUNNING) { return; }
        await this._server.configure([]);
        this._state = ServerState.CONFIGURED;
    }

    async generate() {
        if (this._state < ServerState.RUNNING) { return; }
        if (this._state === ServerState.RUNNING) {
            await this._server.configure([]);
        }
        await this._server.compute();
        this._model = await this._server.codemodel();
        this._updateValues();
        this._onModelChange.fire(this);
    }

    async build() {
        let buildProc = child_process.execFile("cmake", ["--build", this._buildDirectory]);

        buildProc.stdout.pipe(new LineTransform()).on("data", (chunk : string) => {
            this._console.appendLine(chunk);
        });
        buildProc.stderr.on("data", (chunk) => this._console.appendLine(chunk.toString()));

        return new Promise((resolve, reject) => {
            buildProc.on("error", (err) => {
                vscode.window.showErrorMessage("Failed to run build process.", err.message);
                reject(err);
            });
            buildProc.on("exit", (code, signal) => resolve());
        });
    }

    public get targets(): string[] {
        if (this._model === undefined) {
            return [];
        } else {
            let vals: string[] = [];
            return this._model.configurations.reduce(
                (arr, elm) => arr.concat(elm.projects.reduce(
                    (arr, elm) => {
                        if (elm.name === this.project) {
                            return arr.concat(elm.targets.reduce((arr, elm) => arr.concat(elm.name), arr));
                        }
                        return arr;
                    }, arr)), vals);
        }
    }

    public get projects() : string[] {
        if (this._model === undefined) {
            return [];
        } else {
            return this._model.configurations.reduce((arr, elm) => 
                arr.concat(elm.projects.map((value) => value.name)), [] as string[]);
        }
    }

    public get buildTypes() : string[] {
        if (this._model === undefined) {
            return [];
        } else {
            let types = new Set<string>(["Debug", "Release", "RelWithDebInfo", "MinSizeRel"]);
            this._model.configurations.forEach((value) => types.add(value.name));
            return Array<string>(...types.values());
        }
    }

    private _project : string = "";
    public get project() : string {
        return this._project;
    }
    public set project(v : string) {
        this._project = v;
    }
    
    private _buildType : string = "";
    public get buildType() : string {
        return this._buildType;
    }
    public set buildType(v : string) {
        this._buildType = v;
    }
    
    private _target: string ;
    public get target(): string  {
        return this._target;
    }
    public set target(v: string) {
        this._target = v;
        this._context.workspaceState.update(this.name + "-target", v);
    }

    private _updateValues() {
        this.project = this.projects.find((value) => value === this.project) ||  this.projects[0] || "";
        this.target = this.targets.find((value) => value === this.target) || this.targets[0] || "";
        this.buildType = this.buildTypes.find((value) => value === this.buildType) || this.buildTypes[0] || "";
    }
    
    public get name(): string {
        return path.basename(this._sourceDirectory);
    }

    private get pipeName(): string {
        if (process.platform === "win32") {
            return "\\\\?\\pipe\\" + this.name + "-" + process.pid + "-cmake";
        } else {
            return path.join(os.tmpdir(), this.name + "-" + process.pid + "-cmake.sock");
        }
    }
    
    private _restartServer() {
        this._process.on('exit', (code, signal) => {
            this._process = child_process.execFile("cmake", ["-E", "server", "--pipe=" + this.pipeName, "--experimental"]);
            this._socket = new net.Socket();
            this._server = createCMakeServer(this._socket, this._socket);
        })
        this._process.kill()
    }

    private _connectServer() {
        // Wait some time until cmake server is spawned
        setTimeout(() => {
            this._socket.connect(this.pipeName);
            this._socket.on('connect', () => {
                this._server.listen();
                this._state = ServerState.CONNECTED;
            });
        }, 1000);

        this._server.onMessage((msg) => this._onMessage(msg.message));
        this._server.onProgress((msg) => {
            console.log(msg);
        });
        this._server.onSignal((msg) => {

        });
        this._server.onHello((msg) => {
            this._server.handshake(
                msg.supportedProtocolVersions[0],
                this._sourceDirectory,
                this._buildDirectory,
                this._generator).then((value) => {
                    this._state = ServerState.RUNNING;
                    this.generate();
                });
        });
    }

    private _onMessage(msg: string) {
        this._console.appendLine(msg);
    }

    dispose() {
        this._process.kill();
        this._restartServer();
    }

}