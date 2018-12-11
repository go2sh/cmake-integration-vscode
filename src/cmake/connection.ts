interface Message {
    type: string;
}

interface RequestMessage extends Message {
    cookie: string;
}

interface ReplyMessage extends Message {
    cookie: string;
    inReplyTo: string;
}

interface ErrorMessage extends ReplyMessage {
    errorMessage: string;
}

interface Connection {
    listen() : void;
    sendRequest<T>(type: string, params : any): Promise<T>;
    onMessage(type: string, handler : (msg : any) => void) : void;
}

interface ReplyPromise {
    resolve(params : any) : void;
    reject(params : any) : void;
}

function createConnection(input : NodeJS.ReadableStream, output : NodeJS.WritableStream): Connection {
    let sequenceNumber = 0;
    let replyMap: { [name: string]: ReplyPromise } = Object.create(null);
    let messageHandler : { [name : string]: (msg : any) => void } = Object.create(null);
    let buffer : string = "";

    function handleMessage(msg : Message) {
        if (msg.type === "reply" || msg.type === "error") {
            let reply = msg as ReplyMessage;
            let replyPromise = replyMap[reply.cookie];
            if (replyPromise) {
                delete replyMap[reply.cookie];
                if (msg.type === "error") {
                    replyPromise.reject(new Error((reply as ErrorMessage).errorMessage));
                } else {
                    replyPromise.resolve(reply);
                }
            } else {
                console.log("No response promise: " + msg);
            }
        } else {
            let handler = messageHandler[msg.type];
            if (handler) {
                handler(msg);
            } else {
                console.log("No message handler: " + msg);
            }
        }
    }

    function writeMessage(request: RequestMessage) {
        output.write("[== \"CMake Server\" ==[\n");
        output.write(JSON.stringify(request));
        output.write("\n");
        output.write("]== \"CMake Server\" ==]\n");
    }

    let connection: Connection = {
        listen() : void {
            input.on('data', (data : Buffer | String) => {
                buffer = buffer + data.toString();
                const RE = /\[== "CMake Server" ==\[([^]*?)\]== "CMake Server" ==\]/m;
                let match;
                while (match = RE.exec(buffer)) {
                    try {
                        let msg = JSON.parse(match[1]);
                        handleMessage(msg);
                    } catch (e) {
                        console.log(e);
                    } finally {
                        buffer = buffer.slice(match.index + match[0].length, buffer.length);
                    }
                }
            });
        },
        async sendRequest<T>(type: string, params: any): Promise<T> {
            let request: RequestMessage = { type: type, cookie: sequenceNumber.toString(), ...params };
            sequenceNumber++;
            let promise = new Promise<any>((resolve, reject) => {
                try {
                    writeMessage(request);
                } catch (e) {
                    reject(e);
                }
                replyMap[request.cookie] = { resolve: resolve, reject: reject};
            });

            return promise;
           
        },
        onMessage(type : string, handler : (param : any) => void) : void {
            messageHandler[type] = handler;
        }
    };

    return connection;
}

export { createConnection, Connection };

