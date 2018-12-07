import {createConnection, Connection} from './connection';

interface Version {
    major: number;
    minor: number;
}

interface Hello {
    supportedProtocolVersions: Version[];
}

interface Progress {
    progressMessage: string;
    progressMinimum: number;
    progressMaximum: number;
    progressCount: number;
}

interface Display  {
    title: string;
    message: string;
}

interface Signal {
    name: string;
}

interface Handshake {
    protocolVersion: Version;
    sourceDirectory: string;
    buildDirectory: string;
    generator: string;
    extraGenerator?: string;
    platform?: string;
    toolset?: string;
}

enum TargetType {
    STATIC_LIBRARY = "STATIC_LIBRARY",
    MODULE_LIBRARY = "MODULE_LIBRARY",
    SHARED_LIBRARY = "SHARED_LIBRARY",
    OBJECT_LIBRARY = "OBJECT_LIBRARY",
    EXECUTABLE = "EXECUTABLE",
    UTILITY = "UTILITY",
    INTERFACE_LIBRARY = "INTERFACE_LIBRARY"
}

interface Path {
    path: string;
    isSystem: boolean;
}

interface FileGroup {
    language: string;
    compileFlags: string;
    includePath: Path[];
    defines: string[];
    sources: string[];
}

interface Target {
    name: string;
    type: TargetType;
    fullName: string;
    sourceDirectory: string;
    buildDirectory: string;
    artifacts: string[];
    linkerLanguage: string;
    linkLibraries: string[];
    linkFlags: string[];
    linkLanguageFlags: string[];
    frameworkPath: string;
    linkPath: string;
    sysroot: string;
    fileGroups: FileGroup[];
}

interface Project {
    name: string;
    sourceDirectory: string;
    buildDirectory: string;
    targets: Target[];
}

interface Configuration {
    name: string;
    projects: Project[];
}

interface CodeModel {
    configurations: Configuration[];
}

interface CMakeProtocolConnection {
    listen(): void;
    onHello(handler: (data : Hello) => void): void;
    onProgress(handler: (data : Progress) => void): void;
    onSignal(handler: (data: Signal) => void): void;
    onMessage(handler: (data: Display) => void): void;
    configure(args: string[]): Promise<void>;
    compute(): Promise<void>;
    codemodel(): Promise<CodeModel>;
    handshake(data : Handshake): Promise<void>;
}

function createProtocolConnection(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): CMakeProtocolConnection {
    let connection: Connection = createConnection(input, output);

    let result: CMakeProtocolConnection = {
        listen(): void {
            connection.listen();
        },
        onHello: (handler) => connection.onMessage("hello", handler),
        onProgress: (handler) => connection.onMessage("progress", handler),
        onSignal: (handler) => connection.onMessage("signal", handler),
        onMessage: (handler) => connection.onMessage("message", handler),
        async configure(arg: string[]): Promise<void> {
            return connection.sendRequest<void>("configure", { cacheArguments: arg });
        },
        async compute(): Promise<void> {
            return connection.sendRequest<void>("compute", {});
        },
        async codemodel(): Promise<CodeModel> {
            return connection.sendRequest<CodeModel>("codemodel", {});
        },
        handshake(data : Handshake): Promise<void> {
            return connection.sendRequest("handshake", data);
        }
    };

    return result;
}


export {
    Version, Hello, Progress, Display, Signal, Handshake,
    Path, FileGroup, TargetType, Target, Project, Configuration, CodeModel,
    CMakeProtocolConnection, createProtocolConnection
};