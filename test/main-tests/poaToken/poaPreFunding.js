const {
  owner,
  custodian,
  bbkContributors,
  whitelistedPoaBuyers,
  testStartSale,
  testBuyTokens,
  determineNeededTimeTravel,
  testActivate,
  testPayout,
  testClaim,
  testReclaim,
  testSetFailed,
  testPaused,
  testUnpause,
  testUpdateProofOfCustody,
  testTransfer,
  testApprove,
  testTransferFrom,
  testTerminate,
  defaultIpfsHashArray32,
  setupPoaAndEcosystem
} = require('../../helpers/poa')
const {
  testWillThrow,
  timeTravel,
  gasPrice
} = require('../../helpers/general.js')

describe('when in PreFunding (stage 0)', async () => {
  contract('PoaToken', () => {
    let poa
    let fmr

    before('setup contracts', async () => {
      const contracts = await setupPoaAndEcosystem()
      poa = contracts.poa
      fmr = contracts.fmr
    })

    it('should start paused', async () => {
      await testPaused(poa, true)
    })

    it('should NOT unpause, even if owner', async () => {
      await testWillThrow(testUnpause, [poa, { from: owner }])
    })

    it('should NOT buy, even if whitelisted', async () => {
      await testWillThrow(testBuyTokens, [
        poa,
        { from: whitelistedPoaBuyers[0], value: 3e17, gasPrice }
      ])
    })

    it('should NOT setFailed', async () => {
      await testWillThrow(testSetFailed, [poa, { from: owner }])
    })

    it('should NOT activate, even if custodian', async () => {
      await testWillThrow(testActivate, [
        poa,
        fmr,
        defaultIpfsHashArray32,
        { from: custodian }
      ])
    })

    it('should NOT terminate, even if custodian', async () => {
      await testWillThrow(testTerminate, [poa, { from: custodian }])
    })

    it('should NOT reclaim', async () => {
      await testWillThrow(testReclaim, [poa, { from: whitelistedPoaBuyers[0] }])
    })

    it('should NOT payout, even if custodian', async () => {
      await testWillThrow(testPayout, [
        poa,
        fmr,
        { from: custodian, value: 1e18, gasPrice }
      ])
    })

    it('should NOT claim since there are no payouts', async () => {
      await testWillThrow(testClaim, [poa, { from: whitelistedPoaBuyers[0] }])
    })

    it('should NOT updateProofOfCustody, even if valid and from custodian', async () => {
      await testWillThrow(testUpdateProofOfCustody, [
        poa,
        defaultIpfsHashArray32,
        { from: custodian }
      ])
    })

    it('should NOT transfer', async () => {
      await testWillThrow(testTransfer, [
        poa,
        whitelistedPoaBuyers[1],
        1e17,
        {
          from: whitelistedPoaBuyers[0]
        }
      ])
    })

    it('should NOT approve', async () => {
      await testWillThrow(testApprove, [
        poa,
        whitelistedPoaBuyers[1],
        1e17,
        {
          from: whitelistedPoaBuyers[0]
        }
      ])
    })

    it('should NOT transferFrom', async () => {
      // in theory would need approval put here for the sake of demonstrating
      // that approval was attempted as well.
      await testWillThrow(testApprove, [
        poa,
        whitelistedPoaBuyers[1],
        1e17,
        {
          from: whitelistedPoaBuyers[0]
        }
      ])
      await testWillThrow(testTransferFrom, [
        poa,
        whitelistedPoaBuyers[0],
        bbkContributors[0],
        1e17,
        {
          from: whitelistedPoaBuyers[1]
        }
      ])
    })

    // start core stage functionality

    it('should NOT move to funding before startTime, EVEN if owner', async () => {
      await testWillThrow(testStartSale, [poa, { from: owner }])
    })

    it('should allow ANYONE to move to Stages.Funding when after startTime', async () => {
      const neededTime = await determineNeededTimeTravel(
        poa,
        whitelistedPoaBuyers[0]
      )
      await timeTravel(neededTime)
      await testStartSale(poa)
    })
  })
})
