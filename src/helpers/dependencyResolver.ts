interface Dependency {
    project: string;
    target?:string;
}

interface DependencySpecification extends Dependency {
    dependencies: Dependency[];
}

interface DependencyNode extends Dependency {
    parrent: DependencyNode | undefined;
    children: DependencyNode[];
}

class DependencyResolver {

    projectDependencies : Map<string, DependencyNode> = new Map();
    targetDependencies : Map<string, Map<string, DependencyNode>> = new Map();
    
    constructor(dependencies : DependencySpecification[]) {
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
                let node : DependencyNode | undefined = this.getSpecification(childDep);
                if (!node) {
                    node = { ...childDep, parrent: undefined, children: []} as DependencyNode;
                    this.setSpecification(node);
                }
                node.parrent = this.getSpecification(dep);
            }
        }
    }
    private getSpecification(info : Dependency) : DependencyNode | undefined;
    private getSpecification(info : DependencyNode) : DependencyNode | undefined {
        if (info.target) {
            let projectMap = this.targetDependencies.get(info.project);
            if (projectMap) {
                return projectMap.get(info.target);
            }
        } else {
            return this.projectDependencies.get(info.project);
        }
        return undefined;
    }
    
    private setSpecification(info : DependencyNode) {
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

    resolve(target : Dependency) : Dependency[][] {
        let targets : Dependency[][] = [];
        let currentStep : Dependency[] = [];
        let unresolvedDeps : Set<DependencyNode>;
        let resolvedDeps : Set<DependencyNode> = new Set();
        
        unresolvedDeps = new Set();
        this.projectDependencies.forEach((value) => unresolvedDeps.add(value));
        this.targetDependencies.forEach((value) => value.forEach((value) => unresolvedDeps.add(value)));

        while (unresolvedDeps.size > 0 ) {
            let circulaDeps = true;
            for (const dep of unresolvedDeps.values()) {
                if (dep.children.length === 0 || dep.children.reduce((old, value) => old && resolvedDeps.has(value), true)) {
                    unresolvedDeps.delete(dep);
                    resolvedDeps.add(dep);
                    if (currentStep.find((value) => value.project === dep.project)) {
                        targets.push(currentStep);
                        currentStep = [];
                    }
                    currentStep.push(dep);
                    circulaDeps = false;
                }
            }
            if (circulaDeps) {
                throw new Error("Circular dependency detected while resolving dependencies.");
            }
            targets.push(currentStep);
            currentStep = [];
        }
        
        
        return targets;
    }
}

export {Dependency, DependencySpecification, DependencyResolver};