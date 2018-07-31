import web3 from "./web3";

async function calcRedemptionSharePrice(fund, manager, config) {
  const tx = await fund.instance.calcRedemptionSharePrice().send(
    { from: manager, gasPrice: config.gasPrice },
  );
  const block = await web3.eth.getBlock(tx.blockNumber);
  return block.timestamp;
}

export default calcRedemptionSharePrice;
