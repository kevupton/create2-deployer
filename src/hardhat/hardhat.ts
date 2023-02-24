import {extendConfig, extendEnvironment} from 'hardhat/config';
import path from 'path';
import {Environment} from './environment';
import {EnvironmentSettings} from './types';
import {verify, VerifyOptions} from './verify';

export interface Create2Variable {
  file: string;
  contract?: string;
  variable: string;
  id: string;
}

export interface Create2Environment {
  path?: string;
  settings: EnvironmentSettings;
  variables?: Create2Variable[];
  outputPath?: string;
  writeToFile?: boolean;
}

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    environment: Environment;
    verify(options: VerifyOptions): Promise<void>;
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
      settings: {},
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
  hre.verify = options => verify(hre, options);
});
