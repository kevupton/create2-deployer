import {VerificationSubtaskArgs} from './types';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

export interface VerifyOptions extends VerificationSubtaskArgs {
  name?: string;
  attempts?: number;
  interval?: number;
  randomInterval?: boolean;
}

export async function verify(
  hre: HardhatRuntimeEnvironment,
  {
    name,
    attempts = 3,
    interval = 3000,
    randomInterval = true,
    ...options
  }: VerifyOptions
) {
  const logs: Error[] = [];
  for (let i = 0; i < attempts; i++) {
    try {
      return await hre.run('verify:verify', {
        noCompile: true,
        ...options,
      });
    } catch (e: any) {
      console.error(name || options.address, e.message);
      if (
        e.message?.toLowerCase().includes('already verified') ||
        e.message?.includes(
          "but its bytecode doesn't match any of your local contracts."
        )
      ) {
        return;
      }

      logs.push(e);
    }

    if (i < attempts - 1) {
      await new Promise(resolve => {
        setTimeout(
          resolve,
          randomInterval ? Math.round(Math.random() * interval) : interval
        );
      });
    }
  }

  if (logs.length > 0) {
    console.error(logs);
    throw new Error('Verify Failed');
  }
}
