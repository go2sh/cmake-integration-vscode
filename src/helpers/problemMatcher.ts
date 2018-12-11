import * as vscode from 'vscode';
import * as path from 'path';

interface ProblemMatcher {
    buildPath: string;
    match(line: string): void;
    getDiagnostics(): [vscode.Uri, vscode.Diagnostic[] | undefined][];
    clear(): void;
}

class CLMatcher implements ProblemMatcher {

    private static regex = /^([\w/].+?)\((\d+)\): (error|warning) (.+?): (.+)\[.+\]$/;
    private _diagnostics: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();

    buildPath: string = "";

    match(line: string): void {
        let matches = line.match(CLMatcher.regex);
        if (matches) {
            let range: vscode.Range = new vscode.Range(
                new vscode.Position(parseInt(matches[2]) - 1, 0),
                new vscode.Position(parseInt(matches[2]), 0)
            );
            let severity: vscode.DiagnosticSeverity | undefined;
            if (matches[3] === "error") {
                severity = vscode.DiagnosticSeverity.Error;
            } else if (matches[3] === "warning") {
                severity = vscode.DiagnosticSeverity.Warning;
            }

            let uri: vscode.Uri = vscode.Uri.file(matches[1].replace(/\\/g, "/"));//.replace(/projekte/,"Projekte"));  
            if (!this._diagnostics.has(uri)) {
                this._diagnostics.set(uri, []);
            }
            this._diagnostics.get(uri)!.push(new vscode.Diagnostic(range, matches[5], severity));
        }
    }

    getDiagnostics(): [vscode.Uri, vscode.Diagnostic[] | undefined][] {
        let diag: [vscode.Uri, vscode.Diagnostic[] | undefined][] = [];
        for (let key of this._diagnostics.keys()) {
            diag.push([key, this._diagnostics.get(key)]);
        }
        return diag;
    }

    clear(): void {
        this._diagnostics.clear();
    }
}

class GCCMatcher implements ProblemMatcher {

    private static DIAG_REGEX = /^([\w/].+?):(\d+):(\d+): (Error|Warning): (.+)$/;
    private static RANGE_REGEX = /^(\s*)([\^\~]+)(\s*)$/;
    private _diagnostics: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();
    private _lastDiag: vscode.Diagnostic | undefined;

    buildPath: string = "";

    match(line: string): void {
        let matches: RegExpMatchArray | null;
        matches = line.match(GCCMatcher.DIAG_REGEX);
        if (matches) {
            let range: vscode.Range = new vscode.Range(
                new vscode.Position(parseInt(matches[2]) - 1, parseInt(matches[3]) - 1),
                new vscode.Position(parseInt(matches[2]), 0)
            );
            let severity: vscode.DiagnosticSeverity | undefined;
            if (matches[4] === "Error") {
                severity = vscode.DiagnosticSeverity.Error;
            } else if (matches[4] === "Warning") {
                severity = vscode.DiagnosticSeverity.Warning;
            }
            let filePath: string = matches[1];
            if (!path.isAbsolute(filePath)) {
                filePath = path.normalize(path.join(this.buildPath, filePath));
            }


            let uri: vscode.Uri = vscode.Uri.file(filePath);
            if (!this._diagnostics.has(uri)) {
                this._diagnostics.set(uri, []);
            }
            this._lastDiag = new vscode.Diagnostic(range, matches[5], severity);
            this._diagnostics.get(uri)!.push(this._lastDiag);
        }
        if (this._lastDiag) {
            matches = line.match(GCCMatcher.RANGE_REGEX);
            if (matches) {
                let startLine = this._lastDiag.range.start.line;
                this._lastDiag.range = new vscode.Range(
                    startLine, matches[1].length,
                    startLine, matches[1].length + matches[2].length
                );
            }
        }
    }

    getDiagnostics(): [vscode.Uri, vscode.Diagnostic[] | undefined][] {
        let diag: [vscode.Uri, vscode.Diagnostic[] | undefined][] = [];
        for (let key of this._diagnostics.keys()) {
            diag.push([key, this._diagnostics.get(key)]);
        }
        return diag;
    }

    clear(): void {
        this._diagnostics.clear();
    }
}

function getProblemMatchers(): ProblemMatcher[] {
    return [new CLMatcher(), new GCCMatcher()];
}

export { ProblemMatcher, getProblemMatchers };