import * as vscode from "vscode";
import { CMakeClient } from "../cmake/cmake";
import { CMakeBuildTerminal } from "./execution";

interface CMakeTaskDefinition extends vscode.TaskDefinition {
  type: string;
  action: "configure" | "build";
  target?: string;
}

class CMakeTaskProvider implements vscode.TaskProvider {
  private clientTasks: Map<CMakeClient, vscode.Task[]> = new Map();
  private workspaceClients: Map<string, CMakeClient> = new Map();

  static TaskSource: string = "cmake";
  static TaskType: string = "cmake";

  private static generateClientTasks(client: CMakeClient) {
    let tasks: vscode.Task[] = [];
    tasks.push(
      new vscode.Task(
        {
          type: CMakeTaskProvider.TaskType,
          action: "configure"
        } as CMakeTaskDefinition,
        client.workspaceFolder,
        `configure`,
        CMakeTaskProvider.TaskSource,
        new vscode.CustomExecution(() => Promise.reject())
      )
    );
    tasks.push(
      new vscode.Task(
        {
          type: "cmake",
          action: "build",
          target: "clean"
        } as CMakeTaskDefinition,
        client.workspaceFolder,
        `clean`,
        "cmake",
        new vscode.CustomExecution(() => Promise.resolve(
          new CMakeBuildTerminal(
            client!,
            ["clean"]
          )
        ))
      )
    );
    client.targets.forEach((target) => {
      tasks.push(
        new vscode.Task(
          {
            type: "cmake",
            action: "build",
            target: target.name
          } as CMakeTaskDefinition,
          client.workspaceFolder,
          `build ${target.name}`,
          "cmake",
          new vscode.CustomExecution(() => Promise.resolve(
            new CMakeBuildTerminal(
              client!,
              [target.name]
            )
          ))
        )
      );
    });
    return tasks;
  }

  addClient(client: CMakeClient) {
    this.clientTasks.set(client, CMakeTaskProvider.generateClientTasks(client));
    this.workspaceClients.set(client.workspaceFolder.uri.toString(), client);
  }

  deleteClient(client: CMakeClient) {
    this.clientTasks.delete(client);
    this.workspaceClients.delete(client.workspaceFolder.uri.toString());
  }

  changeClientModel(client: CMakeClient) {
    this.clientTasks.set(client, CMakeTaskProvider.generateClientTasks(client));
  }

  provideTasks(
    _token?: vscode.CancellationToken | undefined
  ): vscode.ProviderResult<vscode.Task[]> {
    let tasks: vscode.Task[] = [];
    for (const clientTasks of this.clientTasks.values()) {
      tasks.push(...clientTasks);
    }
    return tasks;
  }
  resolveTask(
    task: vscode.Task,
    _token?: vscode.CancellationToken | undefined
  ): vscode.ProviderResult<vscode.Task> {
    function isWorkspaceFolder(
      scope?: vscode.WorkspaceFolder | vscode.TaskScope
    ): scope is vscode.WorkspaceFolder {
      return typeof scope === "object";
    }
    let client: CMakeClient | undefined;
    if (task.scope) {
      if (isWorkspaceFolder(task.scope)) {
        client = this.workspaceClients.get(task.scope.uri.toString());
      } else if (task.scope === vscode.TaskScope.Workspace) {
        client = this.workspaceClients.values().next().value;
      }
    }
    if (client) {
      let def: CMakeTaskDefinition = <any>task.definition;
      let targets = [];
      if (def.target) {
        targets.push(def.target);
      }
      return new vscode.Task(
        {
          type: "cmake",
          action: def.action,
          target: def.target
        } as CMakeTaskDefinition,
        client.workspaceFolder,
        "Build",
        "cmake",
        Promise.resolve(
          new CMakeBuildTerminal(
            client!,
            targets
          )
        )
      );
    } else {
      throw new Error(`Can't resolve client for Task ${task.name}`);
    }
  }
}

export { CMakeTaskProvider };
