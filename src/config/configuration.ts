import {ContractFactory} from 'ethers';
import {ConfigOrConstructor, DependencyConfig} from './types';

const _dependencyConfigs: DependencyConfig[] = [];
export const Configuration = {
  register<T extends ContractFactory = ContractFactory>(
    config: ConfigOrConstructor<T>,
    deps: number[] = []
  ) {
    return _dependencyConfigs.push({configOrConstructor: config, deps});
  },

  load() {
    const sortedConfigs: DependencyConfig[] = [];

    const configs: Record<
      number,
      {
        remaining: number[];
        dependers: number[];
      }
    > = {};
    const ids = new WeakMap<DependencyConfig, number>();

    _dependencyConfigs.forEach((curConfig, i) => {
      const curId = i + 1;
      const config = {
        dependers: configs[curId]?.dependers || [],
        id: curId,
        remaining: curConfig.deps.concat(),
      };
      ids.set(curConfig, curId);
      if (curConfig.deps.length > 0) {
        curConfig.deps.forEach(depIndex => {
          configs[depIndex] = configs[depIndex] || {
            dependers: [],
            remaining: [],
          };
          configs[depIndex].dependers.push(curId);
        });
      } else {
        sortedConfigs.push(curConfig);
      }
      configs[curId] = config;
    });

    for (let i = 0; i < sortedConfigs.length; i++) {
      const curDep = sortedConfigs[i];
      const curId = ids.get(curDep)!;
      const config = configs[curId];

      config.dependers.forEach(depender => {
        const dependerConfig = configs[depender];
        const index = dependerConfig.remaining.indexOf(curId);
        if (index >= 0) dependerConfig.remaining.splice(index, 1);
        if (dependerConfig.remaining.length === 0) {
          sortedConfigs.push(_dependencyConfigs[depender - 1]);
        }
      });

      ids.delete(curDep);
    }

    if (sortedConfigs.length !== _dependencyConfigs.length) {
      throw new Error('Missing Dependencies');
    }

    return sortedConfigs;
  },
};
