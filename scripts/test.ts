import {ethers} from 'hardhat';
import {PLACEHOLDER_ADDRESS} from '../src/deployer';
import {verify} from '../src/hardhat/verify';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('signer', signer.address);

  await verify({address: PLACEHOLDER_ADDRESS});
  //
  // const tx = await signer.sendTransaction({
  //   value: 1,
  //   nonce: 5,
  //   gasPrice: parseUnits('1000', 'gwei'),
  //   to: signer.address,
  // });
  // console.log(tx.hash);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
