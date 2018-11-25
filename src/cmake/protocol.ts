interface Message {
    type: string;
}

interface Request extends Message {
    cookie: string;
}

interface Reply extends Message {
    cookie: string;
    inReplyTo: string;
}

interface ErrorMessage extends Reply {
    errorMessage: string;
}

interface Version {
    major: number;
    minor: number;
}

interface HelloMessage extends Message {
    supportedProtocolVersions: Version[];
}

interface ProgressMessage extends Reply {
    progressMessage: string;
    progressMinimum: number;
    progressMaximum: number;
    progressCount: number;
}

interface DisplayMessage extends Reply {
    title: string;
    message: string;
}

interface SignalMessage extends Reply {
    name: string;
}

interface HandshakeMessage extends Request {
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

interface CodeModelReply extends CodeModel, Reply {

}

export {
    Message, Request, Reply, ErrorMessage, Version, HelloMessage,
    ProgressMessage, DisplayMessage, SignalMessage, HandshakeMessage,
    Path, FileGroup, TargetType, Target, Project, Configuration, CodeModel, CodeModelReply
};