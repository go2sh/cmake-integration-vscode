import * as vscode from "vscode";
import {IPty, IBasePtyForkOptions} from "node-pty";
import * as path from 'path';

//@ts-ignore
const requireFunc = typeof __webpack_require__ === "function" ? __non_webpack_require__ : require;
const moduleName = path.join(vscode.env.appRoot, "node_modules.asar", "node-pty");
const spawn: typeof import('node-pty').spawn = requireFunc(moduleName).spawn;

import { CMakeClient } from "../cmake/cmake";

class CMakeBuildTerminal implements vscode.Pseudoterminal {
  private terminal: IPty | undefined;
  private closeEmitter: vscode.EventEmitter<
    number | void
  > = new vscode.EventEmitter();
  private writeEmitter: vscode.EventEmitter<string> = new vscode.EventEmitter();

  constructor(private client: CMakeClient, private targets?: string[]) {}

  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    let options: IBasePtyForkOptions = {};
    if (initialDimensions) {
      options.cols = initialDimensions.columns;
      options.rows = initialDimensions.rows;
    }

    this.terminal = spawn(
      this.client.cmakeExecutable,
      this.client.getBuildArguments(this.targets),
      options
    );

    this.terminal.onExit((data) => this.closeEmitter.fire(data.exitCode));
    this.terminal.onData((data) => this.writeEmitter.fire(data));
  }

  close(): void {
    if (this.terminal) {
      this.terminal.kill();
    }
  }

  setDimensions(dim: vscode.TerminalDimensions) {
    if (this.terminal) {
      this.terminal.resize(dim.columns, dim.rows);
    }
  }
}

export { CMakeBuildTerminal };
