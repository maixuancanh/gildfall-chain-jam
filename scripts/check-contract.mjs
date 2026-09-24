import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import solc from 'solc';

const root = fileURLToPath(new URL('../', import.meta.url));
export function compileContract() {
  const files = ['contracts/JinxwellGame.sol', 'vendor/casino-sdk/simulator/contracts/ICasinoGameV2.sol'];
  const sources = Object.fromEntries(files.map(file => [file, { content: readFileSync(path.join(root, file), 'utf8') }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } })));
  const errors = (output.errors ?? []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  return output.contracts['contracts/JinxwellGame.sol'].JinxwellGame;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const contract = compileContract();
  console.log(`JinxwellGame compiled with solc ${solc.version()}; runtime ${contract.evm.deployedBytecode.object.length / 2} bytes`);
}
