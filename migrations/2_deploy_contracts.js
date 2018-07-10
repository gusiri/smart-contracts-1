/* eslint-disable no-console */
const AccessToken = artifacts.require('AccessToken')
const BrickblockAccount = artifacts.require('BrickblockAccount')
const BrickblockToken = artifacts.require('BrickblockToken')
const CentralLogger = artifacts.require('CentralLogger')
const ContractRegistry = artifacts.require('ContractRegistry')
const ExchangeRateProvider = artifacts.require('ExchangeRateProvider')
const ExchangeRates = artifacts.require('ExchangeRates')
const FeeManager = artifacts.require('FeeManager')
const PoaManager = artifacts.require('PoaManager')
const PoaTokenMaster = artifacts.require('PoaToken')
const PoaCrowdsale = artifacts.require('PoaCrowdsale')
const Whitelist = artifacts.require('Whitelist')
const ExchangeRateProviderStub = artifacts.require(
  'stubs/ExchangeRateProviderStub'
)
const { setWeb3 } = require('./helpers/general.js')
setWeb3(web3)

const { localMigration } = require('./networks/localMigration')
const { testnetMigration } = require('./networks/testnetMigration')

// artifacts is not available in other files...
const contracts = {
  AccessToken,
  BrickblockAccount,
  ContractRegistry,
  BrickblockToken,
  ExchangeRates,
  FeeManager,
  CentralLogger,
  PoaManager,
  PoaTokenMaster,
  PoaCrowdsale,
  Whitelist,
  ExchangeRateProvider,
  ExchangeRateProviderStub
}

module.exports = (deployer, network, accounts) => {
  console.log(`deploying on ${network} network`)
  deployer
    .then(async () => {
      switch (network) {
        case 'devGeth':
        case 'test':
          return true
        case 'dev':
          await localMigration(deployer, accounts, contracts, web3)
          return true
        case 'rinkeby':
        case 'kovan':
        case 'hdwallet':
          await testnetMigration(deployer, accounts, contracts, web3)
          return true
        default:
          console.log(
            `unsupported network: ${network}, default deployment will skip`
          )
          return true
      }
    })
    .catch(err => {
      // eslint-disable-next-line no-console
      console.error(err)
    })
}
