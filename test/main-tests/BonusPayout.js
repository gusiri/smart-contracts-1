const BigNumber = require('bignumber.js')
const { gasPrice } = require('../helpers/general')
const {
  testAddEmployee,
  testAddManyEmployee,
  testRemoveEmployee,
  testPayout
} = require('../helpers/bpo')

const BonusPayoutArtifact = artifacts.require('BonusPayout')
const DummyContractArtifact = artifacts.require('./stubs/RemoteContractStub')
const { finalizedBBK } = require('../helpers/bbk')

describe('when distributing BBK bonus payouts', () => {
  contract('BonusPayout', accounts => {
    const owner = accounts[0]
    const bbkHolder = accounts[1]
    const employees = accounts.slice(2)
    const defaultBbkSalaryAmount = 1000
    const defaultStartingBalance = 3234
    const defaultEndingBalance = 34552
    let bpo
    let bbk

    beforeEach('setup contracts', async () => {
      const dummy = await DummyContractArtifact.new(1000, { from: owner })

      bbk = await finalizedBBK(
        owner,
        bbkHolder,
        dummy.address,
        [bbkHolder],
        new BigNumber(1e24)
      )
      bpo = await BonusPayoutArtifact.new(bbk.address)
      await bbk.transfer(bpo.address, new BigNumber('1e24'), {
        from: bbkHolder
      })
    })

    it('should add employee', async () => {
      await testAddEmployee(
        bpo,
        employees[0],
        defaultBbkSalaryAmount,
        defaultStartingBalance,
        {
          from: owner
        }
      )
    })

    it('should remove employee', async () => {
      await testAddEmployee(
        bpo,
        employees[0],
        defaultBbkSalaryAmount,
        defaultStartingBalance,
        {
          from: owner
        }
      )
      await testRemoveEmployee(bbk, bpo, employees[0], defaultEndingBalance, {
        from: owner
      })
    })

    it('should distribute bbk to all registered employees', async () => {
      await testAddManyEmployee(
        bpo,
        employees,
        new BigNumber(defaultBbkSalaryAmount),
        defaultStartingBalance,
        {
          from: owner
        }
      )
      await testPayout(bbk, bpo, employees, {
        from: owner,
        gasPrice
      })
    })
  })
})
