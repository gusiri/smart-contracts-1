const PoaToken = artifacts.require('PoaToken')
const PoaManager = artifacts.require('PoaManager')
const {
  owner,
  broker,
  custodian,
  defaultName32,
  defaultSymbol32,
  defaultFiatCurrency,
  defaultFiatCurrency32,
  defaultFundingTimeout,
  defaultActivationTimeout,
  defaultFundingGoal,
  defaultFiatRate,
  getDefaultStartTime,
  setupEcosystem,
  testSetCurrencyRate,
  testInitialization,
  defaultTotalSupply,
  emptyBytes32
} = require('../../helpers/poa')
const { testWillThrow, addressZero } = require('../../helpers/general.js')
const BigNumber = require('bignumber.js')

describe('when initializing PoaToken', () => {
  contract('PoaToken', () => {
    let reg
    let exr
    let exp
    let poa
    let pmr

    beforeEach('setup contracts', async () => {
      const contracts = await setupEcosystem()

      reg = contracts.reg
      exr = contracts.exr
      exp = contracts.exp

      pmr = await PoaManager.new(reg.address)
      poa = await PoaToken.new()

      // we change the PoaManager to owner address in registry in order to "trick"
      // the only owner function so that testing is easier
      await reg.updateContractAddress('PoaManager', owner)
    })

    it('should start with the right values', async () => {
      await testInitialization(exr, exp, reg, pmr)
    })

    it('should NOT setup more than once', async () => {
      const freshPoa = await testInitialization(exr, exp, reg, pmr)
      await testWillThrow(freshPoa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with a NON ready fiatRate', async () => {
      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with address(0) or null for broker', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupPoaToken, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        addressZero,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])

      await testWillThrow(poa.setupPoaToken, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        null,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with empty name', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        emptyBytes32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with empty symbol', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        emptyBytes32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with empty fiat currency', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        emptyBytes32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with address(0) or null for custodian', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        addressZero,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        null,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with totalSupply < 1e18 or null', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        9e17,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        null,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with startTime before now', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        // simulate day before
        new BigNumber(Date.now()).div(1000).sub(60 * 60 * 24),
        defaultFundingTimeout,
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with fundingTimeout less than 1 day', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        // simulate 1 second less than a day
        new BigNumber(60)
          .mul(60)
          .mul(24)
          .sub(1),
        defaultActivationTimeout,
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with activationTimeout less than 7 days', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        // simulate 1 second less than a day
        new BigNumber(60)
          .mul(60)
          .mul(24)
          .mul(7)
          .sub(1),
        new BigNumber(60)
          .mul(60)
          .mul(24)
          .mul(7)
          .sub(1),
        defaultFundingGoal
      ])
    })

    it('should NOT initialize with fundingGoal less than 1', async () => {
      await testSetCurrencyRate(
        exr,
        exp,
        defaultFiatCurrency,
        defaultFiatRate,
        {
          from: owner,
          value: 1e18
        }
      )

      await testWillThrow(poa.setupContract, [
        defaultName32,
        defaultSymbol32,
        defaultFiatCurrency32,
        broker,
        custodian,
        reg.address,
        defaultTotalSupply,
        await getDefaultStartTime(),
        defaultFundingTimeout,
        defaultActivationTimeout,
        0
      ])
    })
  })
})
