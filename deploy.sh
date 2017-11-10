set -ex

# set variables
ADDRESS_1='0x0015248b433a62fb2d17e19163449616510926b6'
ADDRESS_2='0x00248d782b4c27b5c6f42feb3f36918c24b211a5'
ADDRESS_3='0x00660f1c570b9387b9fa57bbdf6804d82a9fdc53'
ADDRESS_4='0x0089c3fb6a503c7a1eab2d35cfbfa746252aad15'
ADDRESS_5='0x00b71117fff2739e83cadba788873adce169563b'
ADDRESS_6='0x00f18cd3ea9a97828861ac9c965d09b94fce746e'

export ETH_FROM="$ADDRESS_1"
OUT_DIR="./out"

# deploy libraries
REWARDS_ADDR=$(dapp create libraries/rewards)
SIMPLEADAPTER_ADDR=$(dapp create exchange/adapter/simpleAdapter)

# link libraries
SIMPLEADAPTER_PLACEHOLDER='src/exchange/adapter/simpleAdapter.sol:simpleAdapter'
REWARDS_PLACEHOLDER='src/libraries/rewards.sol:rewards'

LINKS="$SIMPLEADAPTER_PLACEHOLDER:$SIMPLEADAPTER_ADDR $REWARDS_PLACEHOLDER:$REWARDS_ADDR"
(set -x; solc --link --libraries "$LINKS" "${OUT_DIR?}"/**/*.bin)

# deploy contracts
ETH_ADDR=$(dapp create PreminedAsset "Ether Token" "ETH-T" 18 1000000000)
EUR_ADDR=$(dapp create PreminedAsset "Euro Token" "EUR-T" 18 1000000000)
MLN_ADDR=$(dapp create PreminedAsset "Melon Token" "MLN-T" 18 1000000000)
DATAFEED_ADDR=$(dapp create datafeeds/DataFeed $MLN_ADDR 0 0)
SIMPLEMARKET_ADDR=$(dapp create exchange/thirdparty/SimpleMarket)
SPHERE_ADDR=$(dapp create sphere/Sphere $DATAFEED_ADDR $SIMPLEMARKET_ADDR)
PARTICIPATION_ADDR=$(dapp create participation/Participation)
RISKMGMT_ADDR=$(dapp create riskmgmt/RMMakeOrders)
#GOVERNANCE_ADDR=$(dapp create system/Governance [] 0 100000) # TODO: can't encode [] yet (paritytech/ethabi/issues/65)
VERSION_ADDR=$(dapp create version/Version 1 $ADDRESS_2 $MLN_ADDR --gas 6000000) # TODO: change the version num and governance address (depends on above)



