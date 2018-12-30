import * as vscode from "vscode";
import * as protocol from '../cmake/protocol';
import { CMakeClient } from "../cmake/client";


interface ProjectContext {
    client: CMakeClient;
    project: protocol.Project;
}

interface ProjectContextItem extends vscode.QuickPickItem {
    context: ProjectContext;
}


async function pickProject(projects: ProjectContext[]): Promise<ProjectContext | undefined> {
    let projectPick = vscode.window.createQuickPick<ProjectContextItem>();
    projectPick.items = projects.map((value) => {
        return {
            context: value,
            label: value.project.name,
            description: value.client.name
        } as ProjectContextItem;
    });
    projectPick.show();

    return new Promise<ProjectContext | undefined>((resolve) => {
        let activeItem: ProjectContextItem;
        projectPick.onDidChangeSelection((e) => {
            const result = projectPick.activeItems[0];
            if (result) {
                resolve(result.context);
                projectPick.hide();
            }
        });
        projectPick.onDidChangeValue(value => {
            if (activeItem && !value && (projectPick.activeItems.length !== 1 || projectPick.activeItems[0] !== activeItem)) {
                projectPick.activeItems = [activeItem];
            }
        });
        projectPick.onDidAccept((e) => {
            const result = projectPick.activeItems[0];
            if (result) {
                resolve(result.context);
                projectPick.hide();
            }
        });
        projectPick.onDidHide((e) => {
            resolve(undefined);
            projectPick.dispose();
        });
    });
}

interface TargetItem extends vscode.QuickPickItem {
    target: protocol.Target;
}

async function pickTarget(context: ProjectContext): Promise<protocol.Target | undefined> {
    let targetPick = vscode.window.createQuickPick<TargetItem>();
    targetPick.items = context.project.targets.reduce((arr, value) => {
        if (value.type !== "INTERFACE_LIBRARY") {
            arr.push({
                target: value,
                label: value.fullName,
                description: value.type
            });
        }
        return arr;
    }, [] as TargetItem[]);
    targetPick.show();

    return new Promise<protocol.Target | undefined>((resolve) => {
        let activeItem : TargetItem;
        targetPick.onDidChangeSelection((e) => {
            const result = targetPick.activeItems[0];
            if (result) {
                resolve(result.target);
                targetPick.hide();
            }
        });
        targetPick.onDidChangeValue(value => {
            if (activeItem && !value && (targetPick.activeItems.length !== 1 || targetPick.activeItems[0] !== activeItem)) {
                targetPick.activeItems = [activeItem];
            }
        });
        targetPick.onDidAccept((e) => {
            const result = targetPick.activeItems[0];
            if (result) {
                resolve(result.target);
                targetPick.hide();
            }
        });
        targetPick.onDidHide((e) => {
            resolve(undefined);
            targetPick.dispose();
        });
    });
}

export { ProjectContext, pickProject, pickTarget };