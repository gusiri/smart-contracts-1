/* eslint-disable no-console */
const chalk = require('chalk')

// given an offset in second, returns seconds since unix epoch
const unixTimeWithOffset = offset => Math.floor(Date.now() / 1000) + offset

const deployContracts = async (
  deployer,
  accounts,
  contracts,
  { useExpStub = true } = {}
) => {
  const {
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
  } = contracts
  const owner = accounts[0]
  const bonusAddress = accounts[1]

  console.log(chalk.yellow('deploying ContractRegistry...'))
  //ContractRegistry
  await deployer.deploy(ContractRegistry, {
    from: owner
  })
  const reg = await ContractRegistry.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying BrickblockToken...'))
  //BrickblockToken
  await deployer.deploy(BrickblockToken, bonusAddress, {
    from: owner
  })
  const bbk = await BrickblockToken.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying AccessToken...'))
  //AccessToken
  await deployer.deploy(AccessToken, reg.address, {
    from: owner
  })
  const act = await AccessToken.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying BrickblockAccount...'))
  //BrickblockAccount
  const releaseTime = unixTimeWithOffset(60 * 60 * 24 * 365 * 2) // 2 years in seconds
  await deployer.deploy(BrickblockAccount, reg.address, releaseTime, {
    from: owner
  })
  const bat = await BrickblockAccount.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying FeeManager...'))
  //FeeManager
  await deployer.deploy(FeeManager, reg.address, {
    from: owner
  })
  const fmr = await FeeManager.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying Whitelist...'))
  //WhiteList
  await deployer.deploy(Whitelist, {
    from: owner
  })
  const wht = await FeeManager.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying PoaManager...'))
  // PoaManager
  await deployer.deploy(PoaManager, reg.address, {
    from: owner
  })
  const pmr = await PoaManager.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying ExchangeRates...'))
  // ExchangeRates
  await deployer.deploy(ExchangeRates, reg.address, {
    from: owner
  })
  const exr = await ExchangeRates.deployed()
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying ExchangeRateProvider...'))
  // ExchangeRateProvider
  let exp
  if (useExpStub) {
    console.log(chalk.red('using stub'))
    await deployer.deploy(ExchangeRateProviderStub, reg.address, {
      from: owner
    })
    exp = await ExchangeRateProviderStub.deployed()
  } else {
    await deployer.deploy(ExchangeRateProvider, reg.address, {
      from: owner
    })
    exp = await ExchangeRateProvider.deployed()
  }

  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying PoaTokenMaster...'))
  // PoaToken master
  const poaTokenMaster = await deployer.deploy(PoaTokenMaster)
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying PoaCrowdsale Master...'))
  // PoaCrowdsale master
  const poaCrowdsaleMaster = await deployer.deploy(PoaCrowdsale)
  console.log(chalk.cyan('deployment successful!'))

  console.log(chalk.yellow('deploying CentralLogger...'))
  // CentralLogger
  await deployer.deploy(CentralLogger, reg.address, {
    from: owner
  })
  const log = await CentralLogger.deployed()
  console.log(chalk.cyan('deployment successful!'))

  return {
    reg,
    bbk,
    act,
    bat,
    fmr,
    wht,
    pmr,
    exr,
    exp,
    poaTokenMaster,
    poaCrowdsaleMaster,
    log
  }
}

const addContractsToRegistry = async config => {
  console.log(chalk.yellow('deploying adding contracts to ContractRegistry...'))

  const {
    act, // AccessToken
    bat, // BrickbloackAccount
    bbk, // BrickblockToken
    exp, // ExchangeRateProvider
    exr, // ExchangeRates
    fmr, // FeeManager
    log, // Logger
    pmr, // PoaManager
    poaTokenMaster,
    poaCrowdsaleMaster,
    reg, // ContractRegistry
    wht // Whitelist
  } = config.contracts
  const { owner } = config

  await reg.updateContractAddress('BrickblockToken', bbk.address, {
    from: owner
  })
  await Promise.all([
    reg.updateContractAddress('AccessToken', act.address, {
      from: owner
    }),
    reg.updateContractAddress('ExchangeRates', exr.address, {
      from: owner
    }),
    reg.updateContractAddress('ExchangeRateProvider', exp.address, {
      from: owner
    }),
    reg.updateContractAddress('FeeManager', fmr.address, {
      from: owner
    }),
    reg.updateContractAddress('BrickblockAccount', bat.address, {
      from: owner
    }),
    reg.updateContractAddress('Whitelist', wht.address, {
      from: owner
    }),
    reg.updateContractAddress('PoaManager', pmr.address, {
      from: owner
    }),
    reg.updateContractAddress('PoaTokenMaster', poaTokenMaster.address, {
      from: owner
    }),
    reg.updateContractAddress('PoaTokenMaster', poaTokenMaster.address, {
      from: owner
    }),
    reg.updateContractAddress(
      'PoaCrowdsaleMaster',
      poaCrowdsaleMaster.address,
      {
        from: owner
      }
    ),
    reg.updateContractAddress('Logger', log.address, {
      from: owner
    })
  ])

  console.log(chalk.cyan('registry update successful!'))
}

const setFiatRate = async (exr, exp, queryType, rate, useStub, config) => {
  await exr.setCurrencySettings(
    queryType,
    'https://min-api.cryptocompare.com/data/price?fsym=ETH',
    30,
    1.5e5,
    {
      from: config.from
    }
  )
  await exr.fetchRate(queryType, config)
  if (useStub) {
    const pendingQueryId = await exp.pendingTestQueryId()
    await exp.simulate__callback(pendingQueryId, '50000', {
      from: config.from
    })
  }
}

module.exports = {
  deployContracts,
  addContractsToRegistry,
  setFiatRate
}
