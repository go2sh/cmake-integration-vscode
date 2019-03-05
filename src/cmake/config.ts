
interface CMakeConfiguration {
  name: string;
  description?: string;
  buildType: string;
  buildDirectory?: string;
  generator?: string;
  env?: { [key: string]: string };
  variables?: { [key: string]: string };
}

function getDefaultConfigurations() : CMakeConfiguration[] {
  return ["Debug", "Release", "RelWithDebInfo", "MinSizeRel"].map((config) => {
    return {
      name: config,
      buildType: config
    } as CMakeConfiguration;
  });
}

export {CMakeConfiguration, getDefaultConfigurations};