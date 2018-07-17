const BigNumber = require('bignumber.js')
//const { testWillThrow } = require('../helpers/general')
const { testAddEmployee } = require('../helpers/bpo')
const DateTimeArtifact = artifacts.require('./libs/DateTime')
const BonusPayoutArtifact = artifacts.require('BonusPayout')
const { finalizedBBK } = require('../helpers/bbk')

describe('when distributing BBK bonus payouts', () => {
  contract('BonusPayout', accounts => {
    const owner = accounts[0]
    const bbkHolder = accounts[1]
    const employees = accounts.slice(2)
    let dt
    let bpo
    let bbk

    before('setup contracts', async () => {
      dt = await DateTimeArtifact.new()
      bbk = await finalizedBBK(
        owner,
        bbkHolder,
        dt.address,
        [bbkHolder],
        new BigNumber(1e24)
      )
      bpo = await BonusPayoutArtifact.new(bbk.address, dt.address)
    })

    it('should add employee', async () => {
      await testAddEmployee(bbk, bpo, employees[0], 10000, 3245)
    })
  })
})
