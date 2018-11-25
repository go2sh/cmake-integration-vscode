import * as protocol from './protocol';
import { Connection, createConnection } from './connection';

interface CMakeServer {
    listen(): void;
    onHello(handler: (msg: protocol.HelloMessage) => void): void;
    onProgress(handler: (msg: protocol.ProgressMessage) => void): void;
    onSignal(handler: (msg: protocol.SignalMessage) => void): void;
    onMessage(handler: (msg: protocol.DisplayMessage) => void): void;
    configure(args: string[]): Promise<void>;
    compute(): Promise<void>;
    codemodel() : Promise<protocol.CodeModel>;
    handshake(version: protocol.Version, sourceDirectory: string, buildDirectory: string, generator: string): Promise<protocol.Reply>;
}

function createCMakeServer(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): CMakeServer {
    let connection: Connection = createConnection(input, output);

    let server: CMakeServer = {
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
        async codemodel() : Promise<protocol.CodeModel> {
            return connection.sendRequest<protocol.CodeModel>("codemodel", {});
        },
        handshake(version: protocol.Version, sourceDirectory: string, buildDirectory: string, generator: string): Promise<protocol.Reply> {
            let args = {
                protocolVersion: version,
                sourceDirectory: sourceDirectory,
                buildDirectory: buildDirectory,
                generator: generator,
                platform: "",
                toolset: ""
            };
            return connection.sendRequest("handshake", args);
        }
    };

    return server;
}

export { createCMakeServer, CMakeServer };