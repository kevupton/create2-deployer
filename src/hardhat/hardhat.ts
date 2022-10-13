import {extendConfig, extendEnvironment} from 'hardhat/config';
import path from 'path';
import {Environment} from './environment';
import {ConfigureOptions, ConstructorOptions} from './types';

export interface Create2Variable {
  file: string;
  contract?: string;
  variable: string;
  id: string;
}

export interface Create2Environment {
  path?: string;
  constructorOptions: ConstructorOptions;
  configureOptions: ConfigureOptions;
  variables?: Create2Variable[];
  outputPath?: string;
  writeToFile?: boolean;
}

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    environment: Environment;
  }
}

declare module 'hardhat/types/config' {
  export interface HardhatConfig {
    environment: Required<Create2Environment> & {
      variableMapping: Record<string, Create2Variable>;
    };
  }

  export interface HardhatUserConfig {
    environment?: Create2Environment;
  }
}

extendConfig((config, userConfig) => {
  const variableMapping: Record<string, Create2Variable> = {};
  const variables = userConfig.environment?.variables || [];

  variables.forEach(variable => {
    variableMapping[path.join(config.paths.sources, variable.file)] = variable;
  });

  config.environment = {
    ...(userConfig.environment || {
      constructorOptions: {},
      configureOptions: {},
    }),
    variables,
    variableMapping,
    writeToFile: userConfig.environment?.writeToFile || false,
    path: path.join(
      config.paths.root,
      userConfig.environment?.path || 'configs'
    ),
    outputPath: path.join(
      config.paths.root,
      userConfig.environment?.outputPath || 'contracts.json'
    ),
  };
});

extendEnvironment(hre => {
  hre.environment = new Environment(hre);
});
