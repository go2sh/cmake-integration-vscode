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

export {
    Message, Request, Reply, ErrorMessage, Version, HelloMessage,
    ProgressMessage, DisplayMessage, SignalMessage, HandshakeMessage
};