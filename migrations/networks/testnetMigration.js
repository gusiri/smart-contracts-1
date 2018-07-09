/* eslint-disable no-console */
const bbk = require('../helpers/bbk')
const BigNumber = require('bignumber.js')

const {
  deployContracts,
  addContractsToRegistry
} = require('../helpers/general')

const testnetMigration = async (deployer, accounts, contracts) => {
  const owner = accounts[0]
  const contributors = accounts.slice(2, 5)

  const instances = await deployContracts(deployer, accounts, contracts, {
    useExpStub: false // we are using a real Exchange rate provider here
  })

  await addContractsToRegistry({ contracts: instances, owner })

  // we need to finalize bbk distribution in order to lock/unlock tokens and test functionality
  await bbk.finalizeBbk(
    instances.bbk,
    owner,
    instances.bat.address,
    contributors,
    new BigNumber('1e21')
  )
}

module.exports = {
  testnetMigration
}
