/*     
 * Copyright 2018 Christoph Seitz
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
 * Helper class to resolve target denpendencies
 */

interface Dependency {
    project: string;
    target?: string;
}

interface DependencySpecification extends Dependency {
    dependencies: Dependency[];
}

interface DependencyNode extends Dependency {
    parrent: DependencyNode | undefined;
    children: DependencyNode[];
}

class DependencyResolver {

    projectDependencies: Map<string, DependencyNode> = new Map();
    targetDependencies: Map<string, Map<string, DependencyNode>> = new Map();

    constructor(dependencies: DependencySpecification[]) {
        for (const dep of dependencies) {
            let node = {
                ...dep,
                parrent: undefined,
                children: []
            };
            this.setSpecification(node);
        }
        // Insert nonexisting child dependecies as empty
        for (const dep of dependencies) {
            for (const childDep of dep.dependencies) {
                let node: DependencyNode | undefined = this.getSpecification(childDep);
                if (!node) {
                    node = { ...childDep, parrent: undefined, children: [] } as DependencyNode;
                    this.setSpecification(node);
                }
                let parrent = this.getSpecification(dep);
                parrent!.children.push(node);
                node.parrent = parrent!;
            }
        }
    }

    private getSpecification(info: DependencyNode, fallback?: boolean): DependencyNode | undefined;
    private getSpecification(info: Dependency, fallback?: boolean): DependencyNode | undefined;
    private getSpecification(info: Dependency, fallback?: boolean): DependencyNode | undefined {
        if (info.target) {
            let projectMap = this.targetDependencies.get(info.project);
            if (projectMap) {
                return projectMap.get(info.target);
            }
            if (fallback) {
                return this.projectDependencies.get(info.project);
            }
        } else {
            return this.projectDependencies.get(info.project);
        }
        return undefined;
    }

    private setSpecification(info: DependencyNode) {
        if (info.target) {
            let proejctMap = this.targetDependencies.get(info.project);
            if (!proejctMap) {
                proejctMap = new Map();
                this.targetDependencies.set(info.project, proejctMap);
            }
            proejctMap.set(info.target, info);
        } else {
            this.projectDependencies.set(info.project, info);
        }
    }
    resolve(target: Dependency): Dependency[][];
    resolve(targets: Dependency[]): Dependency[][];
    resolve(target: Dependency | Dependency[]): Dependency[][] {
        let result: Dependency[][] = [];
        let currentStep: Dependency[] = [];
        let unresolvedDeps: Set<DependencyNode>;
        let resolvedDeps: Set<DependencyNode> = new Set();

        unresolvedDeps = new Set();
        let searchDeps: DependencyNode[] = [];

        if (Array.isArray(target)) {
            target.forEach((dep) => {
                let baseDep = this.getSpecification(dep, true);
                if (baseDep) {
                    searchDeps.push(baseDep);
                } else {
                    if (currentStep.find((value) => value.project === dep.project)) {
                        result.push(currentStep);
                        currentStep = [];
                    }
                    currentStep.push(dep);
                }
            });
            result.push(currentStep);
        } else {
            let baseDep = this.getSpecification(target, true);
            if (baseDep) {
                searchDeps.push(baseDep);
            } else {
                if (currentStep.find((value) => value.project === target.project)) {
                    result.push(currentStep);
                    currentStep = [];
                }
                currentStep.push(target);
            }
        }

        // Find dependencies to resolve
        while (searchDeps.length > 0) {
            let dep = searchDeps.pop();
            unresolvedDeps.add(dep!);
            searchDeps.push(...dep!.children);
        }

        if (unresolvedDeps.size === 0) {
            result.push(currentStep);
            return result;
        }

        // Resolve dependencies
        while (unresolvedDeps.size > 0) {
            let circulaDeps = true;
            for (const dep of unresolvedDeps.values()) {
                if (dep.children.length === 0 || dep.children.reduce<boolean>((old, value) => old && resolvedDeps.has(value), true)) {
                    unresolvedDeps.delete(dep);
                    resolvedDeps.add(dep);
                    if (currentStep.find((value) => value.project === dep.project)) {
                        result.push(currentStep);
                        currentStep = [];
                    }
                    currentStep.push(dep);
                    circulaDeps = false;
                }
            }
            if (circulaDeps) {
                throw new Error("Circular dependency detected while resolving dependencies.");
            }
            result.push(currentStep);
            currentStep = [];
        }

        return result;
    }
}

export { Dependency, DependencySpecification, DependencyResolver };