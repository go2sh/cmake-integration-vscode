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
 * Handling all quick pick action for clients, projects and targets.
 */
import * as vscode from "vscode";
import * as model from "../cmake/model";
import { CMakeClient } from "../cmake/cmake";
import { CMakeConfiguration } from "../cmake/config";

async function pick<T extends vscode.QuickPickItem>(
  items: T[],
  activeItem: T | undefined
) {
  let pick = vscode.window.createQuickPick<T>();
  pick.items = items;
  pick.activeItems = activeItem ? [activeItem] : [];
  pick.show();

  return new Promise<T | undefined>((resolve) => {
    pick.onDidChangeSelection((items) => {
      const result = items[0];
      if (result) {
        resolve(result);
        pick.hide();
      }
    });
    pick.onDidChangeValue((value) => {
      if (
        activeItem &&
        !value &&
        (pick.activeItems.length !== 1 || pick.activeItems[0] !== activeItem)
      ) {
        pick.activeItems = [activeItem];
      }
    });
    pick.onDidAccept(() => {
      const result = pick.activeItems[0];
      if (result) {
        resolve(result);
        pick.hide();
      }
    });
    pick.onDidHide(() => {
      resolve(undefined);
      pick.dispose();
    });
  });
}
interface CMakeItem extends vscode.QuickPickItem {
  client: CMakeClient;
}

async function pickClient(
  clients: CMakeClient[],
  activeClient?: CMakeClient
): Promise<CMakeClient | undefined> {
  let items = clients.map((value) => {
    return {
      client: value,
      label: value.name,
      description: value.sourceUri.fsPath
    } as CMakeItem;
  });

  let result = await pick(
    items,
    items.find((item) => item.client === activeClient)
  );
  if (result) {
    return result.client;
  } else {
    return undefined;
  }
}

interface ProjectContext {
  client: CMakeClient;
  project: model.Project;
}

interface ProjectContextItem extends vscode.QuickPickItem {
  context: ProjectContext;
}

async function pickProject(
  projects: ProjectContext[],
  activeItem?: ProjectContext
): Promise<ProjectContext | undefined> {
  let items = projects.map((value) => {
    return {
      context: value,
      label: value.project.name,
      description: value.client.name
    } as ProjectContextItem;
  });

  let result = await pick(
    items,
    items.find((item) => item.context === activeItem)
  );
  if (result) {
    return result.context;
  }
  return undefined;
}

interface TargetItem extends vscode.QuickPickItem {
  target: model.Target;
}

async function pickTarget(
  context: ProjectContext
): Promise<model.Target | undefined> {
  let items = context.client.projectTargets.map((value) => {
    return {
      target: value,
      label: value.name,
      description: value.type
    } as TargetItem;
  });

  let result = await pick(
    items,
    items.find((item) => item.target === context.client.target)
  );
  if (result) {
    return result.target;
  }
  return undefined;
}

interface CMakeConfigurationItem extends vscode.QuickPickItem {
  config: CMakeConfiguration;
  edit?: boolean;
}

async function pickConfiguration(
  context: ProjectContext
): Promise<CMakeConfiguration | undefined> {
  let items = context.client.configurations.map((value) => {
    return {
      config: value,
      label: value.name,
      description: value.description
    } as CMakeConfigurationItem;
  });
  items.push({
    config: {} as CMakeConfiguration,
    label: "Edit Configurations...",
    edit: true
  });

  let result = await pick(
    items,
    items.find((item) => item.config === context.client.configuration)
  );
  if (result) {
    if (result.edit) {
      await vscode.commands.executeCommand("cmake.editCurrentConfigurations");
      return undefined;
    }
    return result.config;
  }
  return undefined;
}

export {
  ProjectContext,
  pickProject,
  pickTarget,
  pickClient,
  pickConfiguration
};
