import * as vscode from 'vscode';

interface ProblemMatcher {
    match(line : string) : void;
    getDiagnostics() : [vscode.Uri, vscode.Diagnostic[] | undefined][];
    clear() : void;
}

class CLMatcher implements ProblemMatcher {

    private static regex = /^([\w/].+?)\((\d+)\): (error|warning) (.+?): (.+)\[.+\]$/;
    private _diagnostics : Map<vscode.Uri, vscode.Diagnostic[]> = new Map();

    match(line : string) : void {
        let matches = line.match(CLMatcher.regex);
        if (matches) {
            let range : vscode.Range = new vscode.Range(
                new vscode.Position(parseInt(matches[2]) - 1, 0),
                new vscode.Position(parseInt(matches[2]), 0)
            );
            let severity : vscode.DiagnosticSeverity | undefined;
            if (matches[3] === "error") {
                severity = vscode.DiagnosticSeverity.Error;
            } else if (matches[3] === "warning") {
                severity = vscode.DiagnosticSeverity.Warning;
            }
            
            let uri : vscode.Uri = vscode.Uri.file(matches[1].replace(/\\/g,"/"));//.replace(/projekte/,"Projekte"));  
            if (!this._diagnostics.has(uri)) {
                this._diagnostics.set(uri, []);
            }
            this._diagnostics.get(uri)!.push(new vscode.Diagnostic(range,matches[5], severity));
        }
    }

    getDiagnostics() : [vscode.Uri, vscode.Diagnostic[] | undefined][] {
        let diag : [vscode.Uri, vscode.Diagnostic[] | undefined][] = [];
        for (let key of this._diagnostics.keys()) {
            diag.push([key, this._diagnostics.get(key)]);
        }
        return diag;
    }

    clear() : void {
        this._diagnostics.clear();
    }
}

function getProblemMatchers() : ProblemMatcher[] {
    return [new CLMatcher()];
}

export {ProblemMatcher, getProblemMatchers};