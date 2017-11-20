set -ex

# globals
OUT_DIR="./out"
ADDRESS_BOOK='address-book.json'

# set variables
ADDRESS_1='0x0015248b433a62fb2d17e19163449616510926b6'
ADDRESS_2='0x00248d782b4c27b5c6f42feb3f36918c24b211a5'
ADDRESS_3='0x00660f1c570b9387b9fa57bbdf6804d82a9fdc53'
ADDRESS_4='0x0089c3fb6a503c7a1eab2d35cfbfa746252aad15'
ADDRESS_5='0x00b71117fff2739e83cadba788873adce169563b'
ADDRESS_6='0x00f18cd3ea9a97828861ac9c965d09b94fce746e'

export ETH_FROM="$ADDRESS_1"
export ETH_GAS=6900000

# deploy libraries
REWARDS=$(dapp create libraries/rewards)
SIMPLE_ADAPTER=$(dapp create exchange/adapter/simpleAdapter)

# link libraries
SIMPLEADAPTER_PLACEHOLDER='src/exchange/adapter/simpleAdapter.sol:simpleAdapter'
REWARDS_PLACEHOLDER='src/libraries/rewards.sol:rewards'

LINKS="$SIMPLEADAPTER_PLACEHOLDER:$SIMPLE_ADAPTER $REWARDS_PLACEHOLDER:$REWARDS"
(set -x; solc --link --libraries "$LINKS" "${OUT_DIR?}"/**/*.bin)

# deploy contracts
ETH_TOKEN=$(dapp create PreminedAsset "Ether Token" "ETH-T" 18 1000000000)
EUR_TOKEN=$(dapp create PreminedAsset "Euro Token" "EUR-T" 18 1000000000)
MLN_TOKEN=$(dapp create PreminedAsset "Melon Token" "MLN-T" 18 1000000000)
DATAFEED=$(dapp create datafeeds/DataFeed $MLN_TOKEN 0 0)
SIMPLE_MARKET=$(dapp create exchange/thirdparty/SimpleMarket)
SPHERE=$(dapp create sphere/Sphere $DATAFEED $SIMPLE_MARKET)
PARTICIPATION=$(dapp create participation/Participation)
RISK_MGMT=$(dapp create riskmgmt/RMMakeOrders)
GOVERNANCE=$(dapp create system/Governance [4b28c7f4beb488989a2e01333eb67511e07dff31] 0 100000) # TODO: can't encode [] yet (paritytech/ethabi/issues/65), so using a mock address
VERSION=$(dapp create version/Version "1.0.0" $GOVERNANCE $MLN_TOKEN) # TODO: change the version num and governance address (depends on above)

# TODO: make this more dynamic (e.g. writing only to one environment object
cat <<EOF > $ADDRESS_BOOK
{
  "development": {
    "DataFeed": "$DATAFEED",
    "SimpleMarket": "$SIMPLE_MARKET",
    "Sphere": "$SPHERE",
    "Participation": "$PARTICIPATION",
    "RMMakeOrders": "$RISK_MGMT",
    "Governance": "$GOVERNANCE",
    "rewards": "$REWARDS",
    "simpleAdapter": "$SIMPLE_ADAPTER",
    "Version": "$VERSION",
    "MlnToken": "$MLN_TOKEN",
    "EurToken": "$EUR_TOKEN",
    "EthToken": "$ETH_TOKEN"
  }
}
EOF

cat "$ADDRESS_BOOK"
