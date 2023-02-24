import {Provider} from '@ethersproject/providers';
import {Overrides} from 'ethers';

const GAS_PRICE_MULTIPLIER =
  parseFloat(process.env.GAS_PRICE_MULTIPLIER || '') || undefined;

export function getOverrides(
  overrides: Overrides & {from?: string | Promise<string>} = {},
  provider: Provider
) {
  if (GAS_PRICE_MULTIPLIER && !overrides.gasPrice) {
    overrides.gasPrice = (async () => {
      const gasPrice = await provider.getGasPrice();
      // allowing 2 decimals precision
      return gasPrice.mul(Math.floor(GAS_PRICE_MULTIPLIER * 100)).div(100);
    })();
  }

  return overrides;
}
