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
import * as protocol from './protocol';
import { LineTransform } from '../helpers/stream';
import { ProblemMatcher, getProblemMatchers } from '../helpers/problemMatcher';

enum ClientState {
    STOPPED,
    CONNECTED,
    RUNNING,
    CONFIGURED,
    GENERATED,
    BUILDING
}

export class CMakeClient implements vscode.Disposable {

    private _process: child_process.ChildProcess | undefined;
    private _connection: protocol.CMakeProtocolConnection | undefined;

    private _model: protocol.CodeModel | undefined;
    private _state: ClientState = ClientState.STOPPED;
    private _hello: Promise<protocol.Hello> | undefined;

    private _console: vscode.OutputChannel;
    private _diagnostics: vscode.DiagnosticCollection;

    private _onModelChange: vscode.EventEmitter<CMakeClient> = new vscode.EventEmitter();
    readonly onModelChange: vscode.Event<CMakeClient> = this._onModelChange.event;

    private _sourceDirectory: string;
    private _buildDirectory: string;

    private _project: string;
    private _buildType: string;
    private _target: string;

    private _matchers: ProblemMatcher[];

    constructor(
        readonly uri: vscode.Uri,
        private _context: vscode.ExtensionContext
    ) {
        this._sourceDirectory = path.dirname(this.uri.fsPath).replace(/\\/g, "/");
        this._buildDirectory = path.join(this._sourceDirectory, vscode.workspace.getConfiguration("cmake", this.uri).get("buildDirectory", "build")).replace(/\\/g, "/");

        this._project = this._context.workspaceState.get(this.name + "-project", "");
        this._target = this._context.workspaceState.get(this._project + "-target", "");
        this._buildType = this._context.workspaceState.get(this._project + "-buildType", "");

        this._matchers = getProblemMatchers();
        this._diagnostics = vscode.languages.createDiagnosticCollection(this.name);

        this._console = vscode.window.createOutputChannel("CMake (" + this.name + ")");
    }

    public get generator(): string {
        return vscode.workspace.getConfiguration("cmake", this.uri).get("generator", "Ninja");
    }

    public get extraGenerator(): string | undefined {
        return vscode.workspace.getConfiguration("cmake", this.uri).get("extraGenerator");
    }

    public get generatorPlatform(): string | undefined {
        return vscode.workspace.getConfiguration("cmake", this.uri).get("generatorPlatform");
    }

    public get generatorToolset(): string | undefined {
        return vscode.workspace.getConfiguration("cmake", this.uri).get("generatorToolset");
    }

    public get projects(): string[] {
        if (this._model === undefined) {
            return [];
        } else {
            return this._model.configurations.reduce((arr, elm) => {
                if (elm.name === this.buildType) {
                    return arr.concat(elm.projects.map((value) => value.name));
                }
                return arr;
            }, [] as string[]);
        }
    }

    public get project(): string {
        return this._project;
    }
    public set project(v: string) {
        this._project = v;
        this._context.workspaceState.update(this.name + "-project", v);
    }

    public get buildTypes(): string[] {
        if (this._model === undefined) {
            return [];
        } else {
            let types = new Set<string>();
            if (this._model.configurations.length === 1 && this._model.configurations[0].name === "") {
                ["Debug", "Release", "RelWithDebInfo", "MinSizeRel"].forEach(types.add);
                vscode.workspace.getConfiguration("cmake").get<string[]>("buildTypes", []).forEach(types.add);
            } else {
                this._model.configurations.forEach((value) => types.add(value.name));
            }
            return Array<string>(...types.values());
        }
    }

    public get buildType(): string {
        return this._buildType;
    }
    public set buildType(v: string) {
        this._buildType = v;
        this._context.workspaceState.update(this.project + "-buildType", v);
    }

    public get targets(): string[] {
        if (this._model === undefined) {
            return [];
        } else {
            let vals: string[] = [];
            return this._model.configurations.reduce(
                (arr, elm) => {
                    if (elm.name === this.buildType) {
                        return arr.concat(elm.projects.reduce((arr, elm) => {
                            if (elm.name === this.project) {
                                return arr.concat(elm.targets.reduce((arr, elm) => arr.concat(elm.name), arr));
                            }
                            return arr;
                        }, arr));
                    }
                    return arr;
                }, vals
            );
        }
    }

    public get target(): string {
        return this._target;
    }
    public set target(v: string) {
        this._target = v;
        this._context.workspaceState.update(this.project + "-target", v);
    }

    public get isConfigurationGenerator(): boolean {
        return this.generator.match(/^Visual Studio/) !== null;
    }

    public get name(): string {
        return path.basename(this._sourceDirectory);
    }

    public get sourceDirectory(): string {
        return this._sourceDirectory;
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

        await this.createConnection();

        let msg = await this._hello!;
        let handshake: protocol.Handshake = {
            sourceDirectory: this._sourceDirectory,
            buildDirectory: this._buildDirectory,
            protocolVersion: msg.supportedProtocolVersions[0],
            generator: this.generator,
            extraGenerator: this.extraGenerator,
            platform: this.generatorPlatform,
            toolset: this.generatorToolset
        };
        await this._connection!.handshake(handshake);
    }

    async stop() {
        if (this._state === ClientState.STOPPED) {
            return;
        }
        await new Promise((resolve) => {
            this._process!.once('exit', () => resolve());
            this._process!.kill();
        });
    }

    async configure() {
        this.checkReady();

        let args: string[] = [];
        let cacheEntries = vscode.workspace.getConfiguration("cmake", this.uri).get<any>("cacheEntries", {});
        for (let entry in cacheEntries) {
            args.push("-D" + entry + "=" + cacheEntries[entry]);
        }

        if (!this.isConfigurationGenerator) {
            args.push("-DCMAKE_BUILD_TYPE=" + this.buildType);
        }

        await this._connection!.configure(args);
        this._state = ClientState.CONFIGURED;
    }

    async generate() {
        this.checkReady();
        if (this._state === ClientState.RUNNING) {
            await this.configure();
        }
        await this._connection!.compute();
        this._state = ClientState.GENERATED;
    }

    async removeBuildDirectory() {
        const readdir = util.promisify(fs.readdir);
        const lstat = util.promisify(fs.lstat);
        const unlink = util.promisify(fs.unlink);
        const rmdir = util.promisify(fs.rmdir);
        if (this._state > ClientState.RUNNING) {
            this._state = ClientState.RUNNING;
        }

        let removeDir = async (dir: string) => {
            try {
                await lstat(dir);
            } catch (e) {
                return;
            }
            let files = await readdir(dir);
            await Promise.all(files.map(async (file) => {
                let p = path.join(dir, file);
                const stat = await lstat(p);
                if (stat.isDirectory()) {
                    await removeDir(p);
                } else {
                    await unlink(p);
                }
            }));
            await rmdir(dir);
        };
        await removeDir(this._buildDirectory);
    }

    async updateModel() {
        this.checkReady();
        if (this._state < ClientState.GENERATED) {
            throw new Error("Build system not generated yet.");
        }
        this._model = await this._connection!.codemodel();
        this.updateValues();
        this._onModelChange.fire(this);
    }

    async build(target?: string) {
        if (this._state < ClientState.GENERATED) {
            throw new Error("Build system not generated yet.");
        }
        if (this._state === ClientState.BUILDING) {
            return;
        }

        let cmakePath = vscode.workspace.getConfiguration("cmake", this.uri).get("cmakePath", "cmake");
        let args: string[] = [];
        args.push("--build", this._buildDirectory);
        if (target) {
            args.push("--target", target);
        }
        if (this.isConfigurationGenerator) {
            args.push("--config", this.buildType);
        }
        let configEnv = vscode.workspace.getConfiguration("cmake", this.uri).get("buildEnvironment", {});
        let processEnv = process.env;
        let env = { ...processEnv, ...configEnv };

        this._matchers.forEach((value) => value.clear());
        let buildProc = child_process.execFile(cmakePath, args, {
            env: env
        });
        this._state = ClientState.BUILDING;

        buildProc.stdout.pipe(new LineTransform()).on("data", (chunk: string) => {
            this._console.appendLine(chunk);
            this.handleBuildLine(chunk);
        });
        buildProc.stderr.pipe(new LineTransform()).on("data", (chunk: string) => {
            this._console.appendLine(chunk);
            this.handleBuildLine(chunk);
        });

        return new Promise((resolve, reject) => {
            buildProc.on("error", (err) => {
                this._state = ClientState.GENERATED;
                reject(err);
            });
            buildProc.on("exit", (code, signal) => {
                this._diagnostics.set(
                    this._matchers.reduce((previous, current) =>
                        previous.concat(current.getDiagnostics()),
                        [] as [vscode.Uri, vscode.Diagnostic[] | undefined][])
                );
                this._state = ClientState.GENERATED;
                resolve();
            });
        });
    }

    dispose() {
        this.stop();
    }

    private updateValues() {
        this.buildType = this.buildTypes.find((value) => value === this.buildType) || this.buildTypes[0] || "";
        this.project = this.projects.find((value) => value === this.project) || this.projects[0] || "";
        this.target = this.targets.find((value) => value === this.target) || this.targets[0] || "";
    }

    private checkReady() {
        if (this._state === ClientState.BUILDING) {
            throw new Error("Build in progress.");
        }
        if (this._state < ClientState.RUNNING) {
            throw new Error("Not connected to CMake Server.");
        }
    }

    private createConnection(): Promise<void> {
        let socket = new net.Socket();
        let connection = protocol.createProtocolConnection(socket, socket);

        connection.onMessage((msg: protocol.Display) => this.onMessage(msg));
        connection.onSignal((data: protocol.Signal) => this.onSignal(data));
        connection.onProgress((progress: protocol.Progress) => this.onProgress(progress));
        this._hello = new Promise((resolve) => {
            connection.onHello((msg) => {
                this._state = ClientState.RUNNING;
                resolve(msg);
            });
        });

        let cmakePath = vscode.workspace.getConfiguration("cmake", this.uri).get("cmakePath", "cmake");
        let configEnv = vscode.workspace.getConfiguration("cmake", this.uri).get("configurationEnvironment", {});
        let processEnv = process.env;
        let env = { ...processEnv, ...configEnv };
        this._process = child_process.execFile(
            cmakePath,
            ["-E", "server", "--pipe=" + this.pipeName, "--experimental"],
            { env: env }
        );
        this._connection = connection;

        return new Promise((resolve, reject) => {
            let errorHandler = (err: Error) => {
                this._state = ClientState.STOPPED;
                this._process = undefined;
                reject(err);
            };
            this._process!.on("error", errorHandler);
            // Wait some time until cmake server is spawned, the server creates the pipe
            setTimeout(() => {
                socket.connect(this.pipeName);
                socket.on('error', errorHandler);
                socket.on('connect', () => {
                    // Remove promise handlers
                    socket.removeListener('error', errorHandler);
                    this._process!.removeListener('error', errorHandler);

                    socket.on("close", () => {
                        this._state = ClientState.STOPPED;
                        if (this._process) {
                            this._process.kill();
                        }
                    });
                    this._process!.on("exit", (code, signal) => {
                        this._state = ClientState.STOPPED;
                        this._process = undefined;
                    });
                    connection.listen();
                    this._state = ClientState.CONNECTED;
                    resolve();
                });
            }, 500);
        });
    }
    private onProgress(progress: protocol.Progress): void {

    }

    private onSignal(data: protocol.Signal): any {

    }

    private onMessage(msg: protocol.Display) {
        this._console.appendLine(msg.message);
    }

    private handleBuildLine(line: string) {
        for (let matcher of this._matchers) {
            matcher.match(line);
        }
    }
}