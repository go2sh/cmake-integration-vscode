/*
 * Copyright 2019 Christoph Seitz
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
 * Stubs for handling some vscode components
 */
import * as vscode from "vscode";

class TestMemento implements vscode.Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultVal: T): T;
  get<T>(key: string, ex?: T): T | undefined {
    return ex;
  }
  update(key: string, value: any): Thenable<void> {
    return Promise.resolve();
  }
}
class TestExtensionContext implements vscode.ExtensionContext {
  subscriptions: {
    dispose(): any;
  }[] = [];
  workspaceState: vscode.Memento = new TestMemento();
  globalState: vscode.Memento = new TestMemento();
  extensionPath: string = "";
  storagePath: string = "";
  globalStoragePath: string = "";
  logPath: string = "";

  asAbsolutePath(relativePath: string): string {
    return "";
  }
}

export { TestExtensionContext };
