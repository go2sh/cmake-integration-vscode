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
 * Client code for interaction with CMake
 */

import * as vscode from 'vscode';
import * as net from 'net';
import * as child_process from 'child_process';
import * as process from 'process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

import * as model from './model';
import * as protocol from './protocol';
import { LineTransform } from '../helpers/stream';
import { ProblemMatcher, getProblemMatchers } from '../helpers/problemMatcher';
import { CMake } from './cmake';

//const readdir = util.promisify(fs.readdir);
const lstat = util.promisify(fs.lstat);
const unlink = util.promisify(fs.unlink);
//const rmdir = util.promisify(fs.rmdir);

enum ClientState {
    STOPPED,
    CONNECTED,
    RUNNING,
    CONFIGURED,
    GENERATED,
    BUILDING
}

export class CMakeClient extends CMake {

    private _socket: net.Socket | undefined;
    private _process: child_process.ChildProcess | undefined;
    private _connection: protocol.CMakeProtocolConnection | undefined;

    private _state: ClientState = ClientState.STOPPED;

    private _model: protocol.CodeModel | undefined;

    private _matchers: ProblemMatcher[];


    constructor(
        uri: vscode.Uri,
        workspaceFolder: vscode.WorkspaceFolder,
        context: vscode.ExtensionContext
    ) {
        super(uri, workspaceFolder, context);
        this._matchers = getProblemMatchers(this.buildDirectory);
    }

    public get extraGenerator(): string | undefined {
        return vscode.workspace.getConfiguration("cmake", this.sourceUri).get("extraGenerator");
    }

    public get generatorPlatform(): string | undefined {
        return vscode.workspace.getConfiguration("cmake", this.sourceUri).get("generatorPlatform");
    }

    public get generatorToolset(): string | undefined {
        return vscode.workspace.getConfiguration("cmake", this.sourceUri).get("generatorToolset");
    }

    public get sourceDirectory(): string {
        return this.sourcePath;
    }

    private get pipeName(): string {
        if (process.platform === "win32") {
            return "\\\\?\\pipe\\" + this.name + "-" + process.pid + "-cmake";
        } else {
            return path.join(os.tmpdir(), this.name + "-" + process.pid + "-cmake.sock");
        }
    }

    async start() {
        if (this._state >= ClientState.RUNNING) {
            return;
        }

        await this.spwanCMakeServer();
        // Wait some time till cmake server is up to handle our requests.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.createSocket();

        let msg = await this.createConnection();
        if (this._connection && msg) {
            let handshake: protocol.Handshake = {
                sourceDirectory: this.sourcePath,
                buildDirectory: this.buildDirectory,
                protocolVersion: msg.supportedProtocolVersions[0],
                generator: this.generator,
                extraGenerator: this.extraGenerator,
                platform: this.generatorPlatform,
                toolset: this.generatorToolset
            };
            await this._connection.handshake(handshake);
        }
    }

    async stop() {
        if (this._state === ClientState.STOPPED) {
            return;
        }
        await new Promise((resolve, reject) => {
            if (!this._process || this._state === ClientState.STOPPED) {
                return Promise.resolve();
            }

            let killTimer = setTimeout(() => reject(
                {
                    name: "Kill Timeout",
                    message: "Failed to kill server process (Timeout)."
                } as Error
            ), 5000);

            this._process.once('exit', () => {
                clearTimeout(killTimer);
                resolve();
            });
            this._process.kill();
        });
        try {
            if (os.platform() !== "win32") {
                try {
                    await lstat(this.pipeName);
                } catch (e) {
                    return;
                }
                await unlink(this.pipeName);
            }
        } catch (e) {
            throw {
                name: "pipe delete error",
                message: "Failed to remove CMake Server socket: " + e.message
            } as Error;
        }
    }

    async regenerateBuildDirectory() {
        await this.stop();
        await this.start();
    }

    async configure() {
        if (!this._connection || this._state < ClientState.RUNNING) {
            vscode.window.showWarningMessage("CMake Server (" + this.name + " is not running.");
            return;
        }

        this.mayShowConsole();

        let args: string[] = [];
        let cacheEntries = vscode.workspace.getConfiguration("cmake", this.sourceUri).get<any>("cacheEntries", {});
        for (let entry in cacheEntries) {
            args.push("-D" + entry + "=" + cacheEntries[entry]);
        }

        if (!this.isConfigurationGenerator) {
            args.push("-DCMAKE_BUILD_TYPE=" + this.buildType);
        }

        this._state = ClientState.RUNNING;
        try {
            await this._connection.configure(args);
            this._state = ClientState.CONFIGURED;
        } catch (e) {
            // Fail siliently as it is reported via diagnostics
            return;
        }

        await this._connection.compute();
        this._state = ClientState.GENERATED;
        await this.updateModel();
    }

    private async updateModel() {
        if (!this._connection || this._state < ClientState.GENERATED) {
            return;
        }

        this._model = await this._connection.codemodel();
        this.updateValues();

        let cache = await this._connection.cache();
        this.cache.clear();
        cache.forEach((value) => this.cache.set(value.key, {
            name: value.key,
            value: value.value,
            type: value.type
        }));

        this._onModelChange.fire(this);
    }


    async build(target?: string) {
        if (this._state < ClientState.GENERATED) {
            await this.configure();
        }
        if (this._state === ClientState.BUILDING) {
            return;
        }

        this.mayShowConsole();

        let cmakePath = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("cmakePath", "cmake");
        let args: string[] = [];
        args.push("--build", this.buildDirectory);
        if (target) {
            args.push("--target", target);
        }
        if (this.isConfigurationGenerator) {
            args.push("--config", this.buildType);
        }

        let buildProc = child_process.execFile(cmakePath, args, {
            env: this.environment
        });
        buildProc.stdout.pipe(new LineTransform()).on("data", (chunk: string) => {
            this.console.appendLine(chunk);
            this.handleBuildLine(chunk);
        });
        buildProc.stderr.pipe(new LineTransform()).on("data", (chunk: string) => {
            this.console.appendLine(chunk);
            this.handleBuildLine(chunk);
        });

        this._matchers.forEach((value) => value.clear());
        this._state = ClientState.BUILDING;

        return new Promise<void>((resolve, reject) => {
            let error = false;
            buildProc.on("error", (err) => {
                this._state = ClientState.GENERATED;
                error = true;
                reject(err);
            });
            buildProc.on("exit", (code, signal) => {
                this.diagnostics.set(
                    this._matchers.reduce((previous, current) =>
                        previous.concat(current.getDiagnostics()),
                        [] as [vscode.Uri, vscode.Diagnostic[] | undefined][])
                );
                this._state = ClientState.GENERATED;
                if (!error) {
                    resolve();
                }
            });
        });
    }

    dispose() {
        this.stop();
    }

    private updateValues() {
        this._projects = this._model!.configurations.find(
            (value) => value.name === this.buildType)!.projects.map((sP) => {
                return {
                    name: sP.name,
                    targets: sP.targets
                        .filter((value) => value.type !== "INTERFACE_LIBRARY")
                        .map((st) => {
                        return {
                            name: st.name,
                            sourceDirectory: st.sourceDirectory,
                            type: st.type,
                            compileGroups: (st.fileGroups || []).map((sFG) => {
                                return {
                                    compileFlags: sFG.compileFlags,
                                    compilerPath: "",
                                    defines: sFG.defines || [],
                                    sysroot: st.sysroot || "",
                                    includePaths: (sFG.includePath || []).map((sI) => {
                                        return {
                                            path: sI.path
                                        };
                                    }),
                                    language: sFG.language,
                                    sources: sFG.sources
                                } as model.Target["compileGroups"][0];
                            })
                        } as model.Target;
                    })
                } as model.Project;
            });
        this.isModelValid = true;
        this.selectContext();
    }

    private async spwanCMakeServer() {
        let cmakePath = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("cmakePath", "cmake");
        let configEnv = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("configurationEnvironment", {});
        let processEnv = process.env;
        let env = { ...processEnv, ...configEnv };

        this._process = child_process.execFile(
            cmakePath,
            ["-E", "server", "--pipe=" + this.pipeName, "--experimental"],
            { env: env }
        );

        this._process.on("error", (e: Error) => {
            vscode.window.showErrorMessage(
                "CMake Server (" + this.name + ") process error: " + e.message
            );
        });
        this._process.on("exit", () => {
            this._state = ClientState.STOPPED;
            if (this._socket) {
                this._socket.destroy();
                this._socket = undefined;
            }
            this._process = undefined;
        });
    }

    private async createSocket() {
        this._socket = net.createConnection(this.pipeName);
        this._socket.on("error", (e) => {
            vscode.window.showErrorMessage("CMake Server (" + this.name + ") socket error: " + e.message);
        });
        this._socket.on("close", () => {
            this._state = ClientState.STOPPED;
            if (this._process) {
                this._process.kill();
            }
            this._socket = undefined;
        });
    }

    private async createConnection() {
        if (!this._socket) {
            return Promise.reject(
                { name: "no socket", message: "No socket existing." } as Error
            );
        }
        this._connection = protocol.createProtocolConnection(this._socket, this._socket);

        this._connection.onMessage((msg: protocol.Display) => this.onMessage(msg));
        this._connection.onSignal((data: protocol.Signal) => this.onSignal(data));
        this._connection.onProgress((progress: protocol.Progress) => this.onProgress(progress));

        this._socket.once("connect", () => {
            if (this._connection) {
                this._connection.listen();
            }
        });

        return new Promise<protocol.Hello>((resolve, reject) => {
            // Set a timeout for the response
            let helloTimeout = setTimeout(() => {
                reject({
                    name: "Timeout",
                    message: "CMake Server failed to respond."
                } as Error);
            }, 5000);
            if (this._connection === undefined) {
                return reject(
                    { name: "no connection", message: "No connection existing." } as Error
                );
            }
            //Connect to the connection signal
            this._connection.onHello((msg) => {
                this._state = ClientState.RUNNING;
                clearTimeout(helloTimeout);
                resolve(msg);
            });
        });
    }
    private onProgress(progress: protocol.Progress): void {

    }

    private onSignal(data: protocol.Signal): any {
        if (data.name === "dirty") {
            if (vscode.workspace.getConfiguration("cmake").get("reconfigureOnChange", false) && this._state === ClientState.GENERATED) {
                this.configure().then(() => this.updateModel());
            }
        }
        // if (data.name === "fileChange") {
        //     let file = data as protocol.FileChangeSignal;
        // }
    }

    private onMessage(msg: protocol.Display) {
        this.console.appendLine(msg.message);
    }

    private handleBuildLine(line: string) {
        for (let matcher of this._matchers) {
            matcher.match(line);
        }
    }
}