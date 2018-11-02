'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';
import * as child_process from 'child_process';
import { createCMakeServer } from './cmake/server';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "cmake-server" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    // The code you place here will be executed every time your command is executed

    let proc = child_process.execFile("cmake", ["-E","server", "--pipe=\\\\?\\pipe\\asd", "--experimental"]);
    proc.on("message", (message) => {
        console.log("message");
    });
    proc.stderr.on('data', (data) => {
        console.log(data);
    });
    proc.stdout.on('data', (data) => {
        console.log(data);
    });
    proc.on("error", (err) => {
        console.log(err);
    });
    let sock : net.Socket = new net.Socket();
    let server = createCMakeServer(sock, sock);
    let channel = vscode.window.createOutputChannel("cmake");
    setTimeout(() => {
        sock.connect("\\\\?\\pipe\\asd");
        sock.on('connect', () => {
           server.listen();
        });
    }, 1000);
    server.onHello((asd) => {
        let path = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
        server.handshake(asd.supportedProtocolVersions[0], path, path, "Visual Studio 15 2017").then((asd) => {
            server.configure([]);
        }).catch((e) => {
            channel.appendLine("Error: " + e);
        });
    });
    server.onMessage((msg) => {
        channel.appendLine(msg.message);
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}