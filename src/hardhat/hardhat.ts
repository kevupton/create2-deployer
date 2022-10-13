import {extendConfig, extendEnvironment} from 'hardhat/config';
import path from 'path';
import {Environment} from './environment';
import {ConfigureOptions, ConstructorOptions} from './types';

export interface Create2Environment {
  path?: string;
  constructorOptions: ConstructorOptions;
  configureOptions: ConfigureOptions;
}

declare module 'hardhat/types/runtime' {
  export interface HardhatRuntimeEnvironment {
    environment: Environment;
  }
}

declare module 'hardhat/types/config' {
  export interface HardhatConfig {
    environment: Required<Create2Environment>;
  }

  export interface HardhatUserConfig {
    environment?: Create2Environment;
  }
}

extendConfig((config, userConfig) => {
  config.environment = {
    ...(userConfig.environment || {
      constructorOptions: {},
      configureOptions: {},
    }),
    path: path.join(
      config.paths.root,
      userConfig.environment?.path || 'config'
    ),
  };
});

extendEnvironment(hre => {
  hre.environment = new Environment(hre);
});
