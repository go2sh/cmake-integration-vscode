import * as vscode from 'vscode';
import * as net from 'net';
import * as child_process from 'child_process';
import * as process from 'process';
import * as os from 'os';
import * as path from 'path';
import { CMakeServer, createCMakeServer } from './server';

export class CMakeClient implements vscode.Disposable {

    private _sourceDirectory: string;
    private _buildDirectory: string;
    private _generator: string;
    private _context: vscode.ExtensionContext;

    private _diagnostics: vscode.DiagnosticCollection;
    private _buildConsole: vscode.OutputChannel;

    private _process: child_process.ChildProcess;
    private _socket: net.Socket;
    private _server: CMakeServer;


    constructor(
        context: vscode.ExtensionContext,
        sourceDirectory: string,
        buildDirectory: string,
        generator: string
    ) {
        this._context = context;
        this._sourceDirectory = sourceDirectory;
        this._buildDirectory = buildDirectory;
        this._generator = generator;

        let name = path.basename(sourceDirectory);

        this._diagnostics = vscode.languages.createDiagnosticCollection(name + "-cmake")
        this._buildConsole = vscode.window.createOutputChannel("Build (" + name + ")");

        this._startServer();
    }

    configure() {
        this._server.configure([]);
    }
    build() {
        this._server.compute();
    }

    private _startServer() {
        let pipeName: string;
        if (process.platform === "win32") {
            pipeName = "\\\\?\\pipe\\" + name + "-" + process.pid + "-cmake";
        } else {
            pipeName = path.join(os.tmpdir(), name + "-" + process.pid + "-cmake.sock");
        }
        if (this._context) {
            pipeName = pipeName;
        }
        
        this._process = child_process.execFile("cmake", ["-E", "server", "--pipe=" + pipeName, "--experimental"]);
        this._socket = new net.Socket();
        this._server = createCMakeServer(this._socket, this._socket);

        // Wait some time until cmake server is spawned
        setTimeout(() => {
            this._socket.connect(pipeName);
            this._socket.on('connect', () => {
                this._server.listen();
            });
        }, 1000);

        this._server.onMessage((msg) => this._onMessage(msg.message));
        this._server.
        this._server.onHello((msg) => {
            this._server.handshake(
                msg.supportedProtocolVersions[0],
                this._sourceDirectory,
                this._buildDirectory,
                this._generator);
        });
    }

    private _onMessage(msg: string) {
        this._buildConsole.appendLine(msg);
    }

    dispose() {
        this._process.kill();
        this._diagnostics.dispose();
        this._buildConsole.dispose();
    }

}