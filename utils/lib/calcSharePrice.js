import web3 from "./web3";

async function calcSharePrice(fund, manager, config) {
  const tx = await fund.instance.calcSharePrice().send(
    { from: manager, gasPrice: config.gasPrice },
  );
  const block = await web3.eth.getBlock(tx.blockNumber);
  return block.timestamp;
}

export default calcSharePrice;
