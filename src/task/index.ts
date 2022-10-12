import {subtask, types} from 'hardhat/config';
import {TASK_COMPILE_SOLIDITY_READ_FILE} from 'hardhat/src/builtin-tasks/task-names';

subtask(TASK_COMPILE_SOLIDITY_READ_FILE)
  .addParam('absolutePath', undefined, undefined, types.string)
  .setAction(async (taskArgs, hre, runSuper): Promise<string> => {
    const result = await runSuper(taskArgs);
    console.log('content: result');
    return result;
  });
