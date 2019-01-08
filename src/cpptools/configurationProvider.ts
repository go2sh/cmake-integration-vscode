import {Uri} from 'vscode';
import {CancellationToken} from 'vscode-jsonrpc';
import {CustomConfigurationProvider, SourceFileConfiguration, SourceFileConfigurationItem, WorkspaceBrowseConfiguration} from 'vscode-cpptools';


class ConfigurationProvider implements CustomConfigurationProvider {
  
  name: string;  
  extensionId: string;

  constructor() {
    this.name = "";
    this.extensionId = "";
  }

  canProvideConfiguration(uri: Uri, token?: CancellationToken): Thenable<boolean> {
    return Promise.resolve(false);
  }
 
  provideConfigurations(uris: Uri[], token?: CancellationToken): Thenable<SourceFileConfigurationItem[]> {

    return Promise.resolve([]);
  }

  canProvideBrowseConfiguration(token?: CancellationToken): Thenable<boolean> {
    return Promise.resolve(false);
  }

  provideBrowseConfiguration(token?: CancellationToken): Thenable<WorkspaceBrowseConfiguration> {
    let asd : SourceFileConfiguration = {
      compilerPath: "",
      defines: [],
      includePath: [],
      intelliSenseMode: "msvc-x64",
      standard: "c++17"
    };
    asd;
    return Promise.resolve({} as WorkspaceBrowseConfiguration);
  }

  dispose() {
    
  }

}

export { ConfigurationProvider };