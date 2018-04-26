import * as fs from "fs";
import * as pkgInfo from "../../package.json";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
// import * as exchangeInfo from "../info/exchangeInfo";
import {deployContract, retrieveContract} from "../lib/contracts";
import api from "../lib/api";
import unlock from "../lib/unlockAccount";
import governanceAction from "../lib/governanceAction";
import verifyDeployment from "./verify";

const addressBookFile = "./addressBook.json";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const yearInSeconds = 60 * 60 * 24 * 365;

// TODO: make clearer the separation between deployments in different environments
// TODO: make JSdoc style documentation tags here
async function deployEnvironment(environment) {
  const config = masterConfig[environment];
  if (config === undefined) {
    throw new Error(`Deployment for environment ${environment} not defined`);
  } else {
    const nodeNetId = await api.net.version();
    if(nodeNetId !== config.networkId && config.networkId !== "*") {
      throw new Error(`Network ID of node (${nodeNetId}) did not match ID in config "${environment}" (${config.networkId})`);
    }
  }
  const accounts = await api.eth.accounts();
  const opts = {
    from: accounts[0],
    gas: config.gas,
    gasPrice: config.gasPrice,
  };

  const deployed = {};

  if (environment === "kovan") {
    // set up governance and tokens
    deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, yearInSeconds]);
    const mlnAddr = tokenInfo[environment]["MLN-T-M"].address;
    const ethTokenAddress = tokenInfo[environment]["ETH-T-M"].address;
    const mlnToken = await retrieveContract("assets/Asset", mlnAddr);

    // set up pricefeeds
    deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
      mlnAddr,
      'Melon Token',
      'MLN-T-M',
      18,
      'melonport.com',
      mockBytes,
      mockAddress,
      mockAddress,
      [],
      [],
      [
        config.protocol.pricefeed.interval,
        config.protocol.pricefeed.validity
      ], [
        config.protocol.staking.minimumAmount,
        config.protocol.staking.numOperators
      ],
      deployed.Governance.address
    ]);

    deployed.StakingPriceFeed = await deployContract("pricefeeds/StakingPriceFeed", opts, [
      deployed.CanonicalPriceFeed.address,
      mlnAddr,
      deployed.CanonicalPriceFeed.address
    ]);
    await mlnToken.instance.approve.postTransaction(
      opts,
      [
        deployed.StakingPriceFeed.address,
        config.protocol.staking.minimumAmount
      ]
    );
    await deployed.StakingPriceFeed.instance.depositStake.postTransaction(
      opts, [config.protocol.staking.minimumAmount, ""]
    );

    // set up exchanges
    deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [154630446100]); // number is expiration date for market
    deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);

    const pairsToWhitelist = [
      ['MLN-T-M', 'ETH-T-M'],
      ['MLN-T-M', 'MKR-T-M'],
      ['MLN-T-M', 'DAI-T-M'],
    ];
    await Promise.all(
      pairsToWhitelist.map(async (pair) => {
        console.log(`Whitelisting ${pair}`);
        const tokenA = tokenInfo[environment][pair[0]].address;
        const tokenB = tokenInfo[environment][pair[1]].address;
        await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(opts, [tokenA, tokenB]);
      })
    );

    // set up modules and version
    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.OnlyManager = await deployContract("compliance/OnlyManager", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.CentralizedAdapter = await deployContract("exchange/adapter/CentralizedAdapter", opts);
    deployed.Version = await deployContract(
      "version/Version",
      Object.assign(opts, {gas: 6900000}),
      [
        pkgInfo.version, deployed.Governance.address,
        ethTokenAddress, deployed.MlnToken.address, deployed.CanonicalPriceFeed.address, accounts[0]
      ],
      () => {}, true
    );
    deployed.FundRanking = await deployContract("FundRanking", opts);

    // add Version to Governance tracking
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.address]);

    // whitelist exchange
    await governanceAction(
      opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
      [
        deployed.MatchingMarket.address,
        deployed.MatchingMarketAdapter.address,
        true,
        [
          api.util.abiSignature('makeOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('takeOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('cancelOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10)
        ]
      ]
    );

    // register assets
    await Promise.all(
      config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        const tokenEntry = tokenInfo[environment][assetSymbol];
        await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
          tokenEntry.address,
          tokenEntry.name,
          assetSymbol,
          tokenEntry.decimals,
          tokenEntry.url,
          mockBytes,
          mockAddress,
          mockAddress,
          [],
          []
        ]);
        console.log(`Registered ${assetSymbol}`);
      })
    );
  } else if (environment === "live") {
    const deployer = config.protocol.deployer;
    // const deployerPassword = '/path/to/password/file';
    const pricefeedOperator = config.protocol.pricefeed.operator;
    const pricefeedOperatorPassword = '/path/to/password/file';
    const authority = config.protocol.governance.authority;
    const authorityPassword = '/path/to/password/file';
    const mlnAddr = tokenInfo[environment].MLN.address;
    const ethTokenAddress = tokenInfo[environment]["W-ETH"].address;

    deployed.Governance = await deployContract("system/Governance", {from: deployer}, [
      [config.protocol.governance.authority],
      1,
      yearInSeconds
    ]);

    await unlock(authority, authorityPassword);
    deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", {from: config.protocol.governance.authority}, [
      mlnAddr,
      'Melon Token',
      'MLN',
      18,
      'melonport.com',
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
      config.protocol.pricefeed.interval,
      config.protocol.pricefeed.validity,
    ]);

    await unlock(pricefeedOperator, pricefeedOperatorPassword);
    deployed.SimplePriceFeed = await deployContract("pricefeeds/SimplePriceFeed", {from: pricefeedOperator}, [deployed.CanonicalPriceFeed.address, mlnAddr]);

    // NB: setting whitelist below will only work if quorum=1
    await unlock(authority, authorityPassword);
    await deployed.CanonicalPriceFeed.instance.addFeedToWhitelist.postTransaction(
      {from: config.protocol.governance.authority}, [deployed.SimplePriceFeed.address]
    );

    // whitelist exchange
    // TODO: make sure that authority account is unlocked for this section
    await governanceAction(
      opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
      [
        deployed.SimpleMarket.address,
        deployed.SimpleAdapter.address,
        true,
        [
          api.util.abiSignature('makeOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('takeOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('cancelOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
        ]
      ]
    );

    // register assets
    await Promise.all(
      config.protocol.pricefeed.assetsToRegister.map(async (assetSymbol) => {
        console.log(`Registering ${assetSymbol}`);
        await unlock(pricefeedOperator, pricefeedOperatorPassword);
        const tokenEntry = tokenInfo[environment][assetSymbol];
        await governanceAction(
          {from: pricefeedOperator, gas: 6000000},
          deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
            tokenEntry.address,
            tokenEntry.name,
            assetSymbol,
            tokenEntry.decimals,
            tokenEntry.url,
            mockBytes,
            mockAddress,
            mockAddress,
            [],
            []
          ]
        );
        console.log(`Registered ${assetSymbol}`);
      })
    );

    deployed.OnlyManager = await deployContract("compliance/OnlyManager", {from: deployer});
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", {from: deployer});
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", {from: deployer});
    deployed.Version = await deployContract("version/Version", {from: deployer, gas: 6900000}, [pkgInfo.version, deployed.Governance.address, ethTokenAddress, deployed.MlnToken.address, deployed.CanonicalPriceFeed.address, deployer], () => {}, true);

    deployed.Fundranking = await deployContract("FundRanking", {from: deployer});

    // add Version to Governance tracking
    // NB: be sure that relevant authority account is unlocked
    console.log('Adding version to Governance tracking');
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.address]);
  } else if (environment === "development") {
    deployed.Governance = await deployContract("system/Governance", opts, [[accounts[0]], 1, 100000]);
    deployed.EthToken = await deployContract("assets/PreminedAsset", opts);
    deployed.MlnToken = await deployContract("assets/PreminedAsset", opts);
    deployed.EurToken = await deployContract("assets/PreminedAsset", opts);

    deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
      deployed.MlnToken.address,
      'Melon Token',
      'MLN-T',
      18,
      'melonport.com',
      mockBytes,
      mockAddress,
      mockAddress,
      [],
      [],
      [config.protocol.pricefeed.interval, config.protocol.pricefeed.validity],
      [config.protocol.staking.minimumAmount, config.protocol.staking.numOperators],
      deployed.Governance.address
    ]);

    deployed.StakingPriceFeed = await deployContract("pricefeeds/StakingPriceFeed", opts, [
      deployed.CanonicalPriceFeed.address,
      deployed.MlnToken.address,
      deployed.CanonicalPriceFeed.address
    ]);
    await deployed.MlnToken.instance.approve.postTransaction(
      opts,
      [
        deployed.StakingPriceFeed.address,
        config.protocol.staking.minimumAmount
      ]
    );
    await deployed.StakingPriceFeed.instance.depositStake.postTransaction(
      opts, [config.protocol.staking.minimumAmount, ""]
    );

    deployed.SimpleMarket = await deployContract("exchange/thirdparty/SimpleMarket", opts);
    deployed.SimpleAdapter = await deployContract("exchange/adapter/SimpleAdapter", opts);
    deployed.MatchingMarket = await deployContract("exchange/thirdparty/MatchingMarket", opts, [154630446100]);
    deployed.MatchingMarketAdapter = await deployContract("exchange/adapter/MatchingMarketAdapter", opts);

    deployed.NoCompliance = await deployContract("compliance/NoCompliance", opts);
    deployed.RMMakeOrders = await deployContract("riskmgmt/RMMakeOrders", opts);
    deployed.CentralizedAdapter = await deployContract("exchange/adapter/CentralizedAdapter", opts);
    deployed.CompetitionCompliance = await deployContract("compliance/CompetitionCompliance", opts, [accounts[0]]);
    deployed.Version = await deployContract(
      "version/Version",
      Object.assign(opts, {gas: 6900000}),
      [
        pkgInfo.version, deployed.Governance.address, deployed.EthToken.address,
        deployed.MlnToken.address, deployed.CanonicalPriceFeed.address, deployed.CompetitionCompliance.address
      ],
      () => {}, true
    );
    deployed.FundRanking = await deployContract("FundRanking", opts);
    deployed.Competition = await deployContract("competitions/Competition", opts, [deployed.MlnToken.address, deployed.EurToken.address, deployed.Version.address, accounts[5], Math.round(new Date().getTime() / 1000), Math.round(new Date().getTime() / 1000) + 86400, 10 ** 17, 10 ** 22, 10]);
    await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(opts, [deployed.Competition.address]);
    await deployed.Competition.instance.batchAddToWhitelist.postTransaction(opts, [10 ** 22, [accounts[0], accounts[1], accounts[2]]]);

    // whitelist trading pairs
    const pairsToWhitelist = [
      [deployed.MlnToken.address, deployed.EthToken.address],
      [deployed.EurToken.address, deployed.EthToken.address],
      [deployed.MlnToken.address, deployed.EurToken.address],
    ];
    await Promise.all(
      pairsToWhitelist.map(async (pair) => {
        await deployed.MatchingMarket.instance.addTokenPairWhitelist.postTransaction(opts, [pair[0], pair[1]]);
      })
    );

    // add Version to Governance tracking
    await governanceAction(opts, deployed.Governance, deployed.Governance, 'addVersion', [deployed.Version.address]);

    // whitelist exchange
    await governanceAction(
      opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
      [
        deployed.MatchingMarket.address,
        deployed.MatchingMarketAdapter.address,
        true,
        [
          api.util.abiSignature('makeOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('takeOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('cancelOrder', [
            'address', 'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
        ]
      ]
    );

    await governanceAction(
      opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerExchange',
      [
        deployed.MatchingMarket.address,
        deployed.MatchingMarketAdapter.address,
        true,
        [
          api.util.abiSignature('makeOrder', [
            'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('takeOrder', [
            'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
          api.util.abiSignature('cancelOrder', [
            'address[5]', 'uint256[6]', 'bytes32', 'uint8', 'bytes32', 'bytes32'
          ]).slice(0,10),
        ]
      ]
    );

    // register assets
    await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
      deployed.EthToken.address,
      "Ether token",
      "ETH-T",
      18,
      "ethereum.org",
      mockBytes,
      mockAddress,
      mockAddress,
      [],
      []
    ]);
    await governanceAction(opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset', [
      deployed.EurToken.address,
      "Euro token",
      "EUR-T",
      18,
      "europa.eu",
      mockBytes,
      mockAddress,
      mockAddress,
      [],
      []
    ]);
  }
  // await verifyDeployment(deployed);
  return deployed;  // return instances of contracts we just deployed
}

// takes `deployed` object as defined above, and environment to write to
async function writeToAddressBook(deployedContracts, environment) {
  let addressBook;
  if (fs.existsSync(addressBookFile)) {
    addressBook = JSON.parse(fs.readFileSync(addressBookFile));
  } else addressBook = {};

  const namesToAddresses = {};
  Object.keys(deployedContracts)
    .forEach(key => {
      namesToAddresses[key] = deployedContracts[key].address
    });
  addressBook[environment] = namesToAddresses;

  fs.writeFileSync(
    addressBookFile,
    JSON.stringify(addressBook, null, '  '),
    'utf8'
  );
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify an environment using the environment variable CHAIN_ENV`);
  } else {
    deployEnvironment(environment)
      .then(deployedContracts => writeToAddressBook(deployedContracts, environment))
      .catch(err => console.error(err.stack))
      .finally(() => process.exit())
  }
}

export default deployEnvironment;
