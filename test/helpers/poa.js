const PoaToken = artifacts.require('PoaToken')
const ContractRegistry = artifacts.require('BrickblockContractRegistry')
const Whitelist = artifacts.require('BrickblockWhitelist')
const AccessToken = artifacts.require('BrickblockAccessToken')
const ExchangeRates = artifacts.require('ExchangeRates')
const ExchangeRateProvider = artifacts.require('ExchangeRateProviderStub')
const FeeManager = artifacts.require('BrickblockFeeManager')

const assert = require('assert')
const {
  getEtherBalance,
  getGasUsed,
  areInRange,
  gasPrice,
  timeTravel,
  sendTransaction,
  testWillThrow
} = require('./general')
const { finalizedBBK } = require('./bbk')
const { testApproveAndLockMany } = require('./act')
const {
  testSetCurrencySettings,
  testFetchRate,
  testSetRate,
  testSetQueryId
} = require('./exr')
const BigNumber = require('bignumber.js')

const accounts = web3.eth.accounts
const owner = accounts[0]
const broker = accounts[1]
const custodian = accounts[2]
const bbkBonusAddress = accounts[3]
const bbkContributors = accounts.slice(4, 6)
// overlap with bbkContributors... need more than 2 buyer accounts
const whitelistedPoaBuyers = accounts.slice(4, 9)
const bbkTokenDistAmount = new BigNumber(1e18)
const actRate = new BigNumber(1e3)
const defaultName = 'TestPoa'
const defaultSymbol = 'TPA'
const defaultFiatCurrency = 'EUR'
const defaultFundingTimeout = new BigNumber(60 * 60 * 24)
const defaultActivationTimeout = new BigNumber(60 * 60 * 24 * 7)
const defaultFundingGoal = new BigNumber(5e5)
const defaultFiatRate = new BigNumber(33333)
const defaultIpfsHash = 'QmSUfCtXgb59G9tczrz2WuHNAbecV55KRBGXBbZkou5RtE'
const getDefaultStartTime = async () => {
  const currentBlock = await web3.eth.getBlock(web3.eth.blockNumber)
  const blockTime = new BigNumber(currentBlock.timestamp)
  const realTime = new BigNumber(Date.now()).div(1000).floor()

  return blockTime.greaterThan(realTime) ? blockTime.add(60) : realTime.add(60)
}

const determineNeededTimeTravel = async poa => {
  const startTime = await poa.startTime()
  const currentBlock = await web3.eth.getBlock(web3.eth.blockNumber)
  const blockNow = new BigNumber(currentBlock.timestamp)
  return blockNow.greaterThan(startTime)
    ? 0
    : startTime
        .sub(blockNow)
        .add(1)
        .toNumber()
}

// sets up all contracts needed in the ecosystem for poa to function
const setupEcosystem = async () => {
  const reg = await ContractRegistry.new()
  const act = await AccessToken.new(reg.address)
  const bbk = await finalizedBBK(
    owner,
    bbkBonusAddress,
    act.address,
    bbkContributors,
    bbkTokenDistAmount
  )
  const exr = await ExchangeRates.new(reg.address)

  if (actRate.greaterThan(0)) {
    await exr.setActRate(actRate)
    const postActRate = await exr.getRateReadable('ACT')

    assert.equal(
      postActRate.toString(),
      actRate.toString(),
      'ACT rate should be set'
    )
  }

  const exp = await ExchangeRateProvider.new(reg.address)
  const fmr = await FeeManager.new(reg.address)
  const wht = await Whitelist.new()

  for (const buyer of whitelistedPoaBuyers) {
    const preWhitelisted = await wht.whitelisted(buyer)
    await wht.addAddress(buyer)
    const postWhitelisted = await wht.whitelisted(buyer)

    assert(!preWhitelisted, 'the buyer should start NOT whitelisted')
    assert(postWhitelisted, 'the buyer should be whitelisted')
  }

  await reg.updateContractAddress('Owner', owner)
  await reg.updateContractAddress('BrickblockToken', bbk.address)
  await reg.updateContractAddress('AccessToken', act.address)
  await reg.updateContractAddress('ExchangeRates', exr.address)
  await reg.updateContractAddress('ExchangeRateProvider', exp.address)
  await reg.updateContractAddress('FeeManager', fmr.address)
  await reg.updateContractAddress('Whitelist', wht.address)

  await testApproveAndLockMany(bbk, act, bbkContributors, bbkTokenDistAmount)

  return {
    reg,
    act,
    bbk,
    exr,
    exp,
    fmr,
    wht
  }
}

const testSetCurrencyRate = async (exr, exp, currencyType, rate, config) => {
  const callInterval = new BigNumber(30)
  const queryString = 'https://domain.com?currency=ETH'
  const callbackGasLimit = new BigNumber(1.5e5)
  await testSetCurrencySettings(
    exr,
    currencyType,
    callInterval,
    callbackGasLimit,
    queryString,
    {
      from: config.from
    }
  )

  await testFetchRate(exr, exp, currencyType, config)

  await testSetRate(exr, exp, rate, false)
}

const setupPoaAndEcosystem = async () => {
  const { reg, act, bbk, exr, exp, fmr, wht } = await setupEcosystem()

  await testSetCurrencyRate(exr, exp, defaultFiatCurrency, defaultFiatRate, {
    from: owner,
    value: 1e18
  })

  const poa = await PoaToken.new()
  await poa.setupContract(
    defaultName,
    defaultSymbol,
    defaultFiatCurrency,
    broker,
    custodian,
    reg.address,
    await getDefaultStartTime(),
    defaultFundingTimeout,
    defaultActivationTimeout,
    defaultFundingGoal
  )

  return {
    reg,
    act,
    bbk,
    exr,
    exp,
    fmr,
    wht,
    poa
  }
}

const testInitialization = async (exr, exp, reg) => {
  await testSetCurrencyRate(exr, exp, defaultFiatCurrency, defaultFiatRate, {
    from: owner,
    value: 1e18
  })

  const defaultStartTime = await getDefaultStartTime()

  const poa = await PoaToken.new()
  await poa.setupContract(
    defaultName,
    defaultSymbol,
    defaultFiatCurrency,
    broker,
    custodian,
    reg.address,
    defaultStartTime,
    defaultFundingTimeout,
    defaultActivationTimeout,
    defaultFundingGoal
  )

  const name = await poa.name()
  const symbol = await poa.symbol()
  const proofOfCustody = await poa.proofOfCustody()
  const fiatCurrency = await poa.fiatCurrency()
  const actualOwner = await poa.owner()
  const actualBroker = await poa.broker()
  const actualCustodian = await poa.custodian()
  const decimals = await poa.decimals()
  const feeRate = await poa.feeRate()
  const creationTime = await poa.creationTime()
  const startTime = await poa.startTime()
  const fundingTimeout = await poa.fundingTimeout()
  const fundingGoalInCents = await poa.fundingGoalInCents()
  const totalPerTokenPayout = await poa.totalPerTokenPayout()
  const fundedAmountInWei = await poa.fundedAmountInWei()
  const totalSupply = await poa.totalSupply()
  const contractBalance = await poa.balanceOf(poa.address)
  const stage = await poa.stage()
  const paused = await poa.paused()

  assert.equal(name, defaultName, 'name should match that given in constructor')
  assert.equal(
    symbol,
    defaultSymbol,
    'symbol should match that given in constructor'
  )
  assert.equal(proofOfCustody, '', 'proofOfCustody should start uninitialized')
  assert.equal(
    fiatCurrency,
    defaultFiatCurrency,
    'fiatCurrency should match that given in constructor'
  )
  assert.equal(
    owner,
    actualOwner,
    'actualOwner should match that in msg.sender in creating tx'
  )
  assert.equal(
    actualBroker,
    broker,
    'actualBroker should match broker in constructor'
  )
  assert.equal(
    actualCustodian,
    custodian,
    'actualCustodian should match custodian in constructor'
  )
  assert.equal(
    decimals.toString(),
    new BigNumber(18).toString(),
    'decimals should be constant of 18'
  )
  assert.equal(
    feeRate.toString(),
    new BigNumber(5).toString(),
    'fee rate should be a constant of 5'
  )
  assert(
    creationTime.lessThan(new BigNumber(Date.now()).div(1000)) &&
      creationTime.greaterThan(new BigNumber(Date.now()).div(1000).sub(5000)),
    'creationTime no less than 5 seconds before now()'
  )
  assert.equal(
    startTime.toString(),
    defaultStartTime.toString(),
    'startTime should match startTime given in constructor'
  )
  assert.equal(
    fundingTimeout.toString(),
    defaultFundingTimeout.toString(),
    'fundingTimeout should match that given in constructor'
  )
  assert.equal(
    fundingGoalInCents.toString(),
    defaultFundingGoal.toString(),
    'fundingGoalInCents should match that given in constructor'
  )
  assert.equal(
    totalPerTokenPayout.toString(),
    new BigNumber(0).toString(),
    'totalPerTokenPayout should start uninitialized'
  )
  assert.equal(
    fundedAmountInWei.toString(),
    new BigNumber(0).toString(),
    'fundedAmountInWei should start uninitialized'
  )
  assert.equal(
    totalSupply.toString(),
    new BigNumber(0).toString(),
    'totalSupply should be 0 (uninitialized)'
  )
  assert.equal(
    contractBalance.toString(),
    totalSupply.toString(),
    'contract balance should match totalSupply'
  )
  assert.equal(
    stage.toString(),
    new BigNumber(0).toString(),
    'stage should start at 0 (PreFunding)'
  )
  assert(paused, 'contract should start paused')
}

const testWeiToFiatCents = async (poa, weiInput) => {
  const expectedFiat = weiInput
    .mul(defaultFiatRate)
    .div(1e18)
    .floor()

  const actualFiat = await poa.weiToFiatCents(weiInput)

  assert.equal(
    expectedFiat.toString(),
    actualFiat.toString(),
    'weiInput converted to actualFiat should match expectedFiat'
  )
}

const testFiatCentsToWei = async (poa, fiatCentInput) => {
  const expectedWei = fiatCentInput
    .mul(1e18)
    .div(defaultFiatRate)
    .floor()

  const actualWei = await poa.fiatCentsToWei(fiatCentInput)

  assert.equal(
    expectedWei.toString(),
    actualWei.toString(),
    'fiatCentInput converted to actualWei should match expectedWei'
  )
}

const testWeiToTokens = async (poa, weiInput) => {
  const expectedTokens = weiInput
    .mul(defaultFiatRate)
    .div(1e18)
    .mul(1e20)
    .div(defaultFundingGoal)
    .floor()

  const actualTokens = await poa.weiToTokens(weiInput)

  assert.equal(
    expectedTokens.toString(),
    actualTokens.toString(),
    'weiInput converted to actualTokens should match expectedTokens'
  )
}

const testCalculateFee = async (poa, taxableValue) => {
  const feeRate = await poa.feeRate()
  const expectedFee = feeRate
    .mul(taxableValue)
    .div(1e3)
    .floor()

  const actualFee = await poa.calculateFee(taxableValue)

  assert.equal(
    actualFee.toString(),
    new BigNumber('5e15').toString(),
    'actualFee should be 5e15'
  )
  assert.equal(
    expectedFee.toString(),
    actualFee.toString(),
    'actualFee calculated from calculateFee should match expectedFee'
  )
}

const testStartSale = async (poa, config) => {
  const preStage = await poa.stage()

  await poa.startSale(config ? config : { from: owner })

  const postStage = await poa.stage()

  assert.equal(
    preStage.toString(),
    new BigNumber(0).toString(),
    'stage should start as 0, PreFunding'
  )
  assert.equal(
    postStage.toString(),
    new BigNumber(1).toString(),
    'stage should start as 1, Funding'
  )
}

const testBuyTokens = async (poa, config) => {
  assert(!!config.gasPrice, 'gasPrice must be given')
  const buyer = config.from
  const weiBuyAmount = new BigNumber(config.value)

  const preEthBalance = await getEtherBalance(buyer)
  const preTokenBalance = await poa.balanceOf(buyer)
  const preFundedAmount = await poa.fundedAmountInWei()
  const preUserWeiInvested = await poa.investmentAmountPerUserInWei(buyer)

  const tx = await poa.buy(config)
  const gasUsed = await getGasUsed(tx)
  const gasCost = new BigNumber(gasUsed).mul(config.gasPrice)
  const postEthBalance = await getEtherBalance(buyer)
  const postTokenBalance = await poa.balanceOf(buyer)
  const postFundedAmount = await poa.fundedAmountInWei()
  const postUserWeiInvested = await poa.investmentAmountPerUserInWei(buyer)

  const expectedPostEthBalance = preEthBalance.sub(weiBuyAmount).sub(gasCost)
  const tokenBuyAmount = await poa.weiToTokens(weiBuyAmount)

  assert.equal(
    expectedPostEthBalance.toString(),
    postEthBalance.toString(),
    'postEth balance should match expected value'
  )
  assert.equal(
    postTokenBalance.sub(preTokenBalance).toString(),
    tokenBuyAmount.toString(),
    'buyer token balance should be incremented by tokenBuyAmount'
  )
  assert.equal(
    postFundedAmount.sub(preFundedAmount).toString(),
    weiBuyAmount.toString(),
    'fiat fundedAmountInWei should be incremented by eth wei amount'
  )
  assert.equal(
    postUserWeiInvested.sub(preUserWeiInvested).toString(),
    weiBuyAmount.toString(),
    'userWeiInvested should be incremented for the buying user'
  )

  return postTokenBalance
}

const testBuyTokensMulti = async (poa, buyAmount) => {
  for (const buyer of whitelistedPoaBuyers) {
    await testBuyTokens(poa, { from: buyer, value: buyAmount, gasPrice })
  }
}

/*
  it seems that somehow the actual call is disconnected from the proxy instance
  what is going on here? need to find some way to test this....
*/
const testBuyRemainingTokens = async (poa, config) => {
  assert(!!config.gasPrice, 'gasPrice must be given')
  assert(!!config.from, 'from must be given')

  const fundedAmountInWei = await poa.fundedAmountInWei()
  const fundingGoalInCents = await poa.fundingGoalInCents()
  const fundingGoalWei = await poa.fiatCentsToWei(fundingGoalInCents)
  const remainingBuyableEth = fundingGoalWei.sub(fundedAmountInWei)

  config.value = remainingBuyableEth
  const buyer = config.from
  const weiBuyAmount = new BigNumber(config.value)
  const preStage = await poa.stage()

  const preEthBalance = await getEtherBalance(buyer)
  const preTokenBalance = await poa.balanceOf(buyer)
  const preFundedWei = await poa.fundedAmountInWei()
  const tx = await poa.buy(config)
  const gasUsed = await getGasUsed(tx)
  const gasCost = new BigNumber(gasUsed).mul(config.gasPrice)

  const postEthBalance = await getEtherBalance(buyer)
  const postTokenBalance = await poa.balanceOf(buyer)
  const postFundedWei = await poa.fundedAmountInWei()

  const expectedPostEthBalance = preEthBalance.sub(weiBuyAmount).sub(gasCost)
  const tokenBuyAmount = await poa.weiToTokens(weiBuyAmount)
  const postFundedFiatCents = await poa.weiToFiatCents(postFundedWei)

  assert.equal(
    expectedPostEthBalance.toString(),
    postEthBalance.toString(),
    'postEth balance should match expected value'
  )

  assert(
    // we lose A LOT of precision due to handling fiat...
    areInRange(postTokenBalance.sub(preTokenBalance), tokenBuyAmount, 1e15),
    'buyer token balance should be incremented by tokenBuyAmount'
  )
  assert.equal(
    postFundedWei.sub(preFundedWei).toString(),
    weiBuyAmount.toString(),
    'fiat fundedAmountInWei should be incremented by fiatBuyAmount'
  )
  assert(
    areInRange(fundingGoalInCents, postFundedFiatCents, 1e1),
    'fundingGoal should be met'
  )

  const postStage = await poa.stage()

  assert.equal(
    preStage.toString(),
    new BigNumber(1).toString(),
    'stage should be 1, Funding'
  )
  assert.equal(
    postStage.toString(),
    new BigNumber(2).toString(),
    'stage should be 2, Pending'
  )
}

const testActivate = async (poa, fmr, ipfsHash, config) => {
  const contractBalance = await getEtherBalance(poa.address)
  const calculatedFee = await poa.calculateFee(contractBalance)

  const preFeeManagerBalance = await getEtherBalance(fmr.address)
  const preStage = await poa.stage()
  const preCustody = await poa.proofOfCustody()
  const prePaused = await poa.paused()
  const preBrokerPayouts = await poa.currentPayout(broker, true)
  await poa.activate(ipfsHash, config)
  const postFeeManagerBalance = await getEtherBalance(fmr.address)
  const postStage = await poa.stage()
  const postCustody = await poa.proofOfCustody()
  const postPaused = await poa.paused()
  const postBrokerPayouts = await poa.currentPayout(broker, true)

  assert.equal(
    postFeeManagerBalance.sub(preFeeManagerBalance).toString(),
    calculatedFee.toString(),
    'feeManager ether balance should be incremented by paid fee'
  )
  assert.equal(
    preStage.toString(),
    new BigNumber(2),
    'preStage should be 2, Pending'
  )
  assert.equal(
    postStage.toString(),
    new BigNumber(4),
    'postStage should be 4, Active'
  )
  assert.equal(preCustody, '', 'proofOfCustody should start empty')
  assert.equal(
    postCustody,
    ipfsHash,
    'proofOfCustody should be set to ipfsHash'
  )
  assert(prePaused, 'should be paused before activation')
  assert(!postPaused, 'should not be paused after activation')
  assert.equal(
    postBrokerPayouts.sub(preBrokerPayouts).toString(),
    contractBalance.sub(calculatedFee).toString(),
    'contract balance after fee has been paid should be claimable by broker'
  )
}

const testBrokerClaim = async poa => {
  const preContractBalance = await getEtherBalance(poa.address)
  const preBrokerBalance = await getEtherBalance(broker)

  const tx = await poa.claim({ from: broker, gasPrice })

  const postContractBalance = await getEtherBalance(poa.address)
  const postBrokerBalance = await getEtherBalance(broker)
  const gasUsed = await getGasUsed(tx)
  const expectedPostBrokerBalance = preBrokerBalance
    .add(preContractBalance)
    .sub(new BigNumber(gasUsed).mul(gasPrice))

  assert.equal(
    postBrokerBalance.toString(),
    expectedPostBrokerBalance.toString(),
    'postBrokerBalance should match expectedPostBrokerBalance'
  )
  assert.equal(
    postContractBalance.toString(),
    new BigNumber(0).toString(),
    'postContractBalance should be 0'
  )
}

const testPayout = async (poa, fmr, config) => {
  assert(config.from, 'from not included in config!')
  assert(config.value, 'value not included in config!')
  assert(config.gasPrice, 'gasPrice not included in config!')
  const totalSupply = await poa.totalSupply()
  const payoutValue = new BigNumber(config.value)
  const _fee = await poa.calculateFee(payoutValue)
  const fee = _fee.add(
    payoutValue
      .sub(_fee)
      .mul(1e18)
      .mod(totalSupply)
      .div(1e18)
      .floor()
  )

  const preContractTotalTokenPayout = await poa.totalPerTokenPayout()
  const preCustodianEtherBalance = await getEtherBalance(custodian)
  const preContractEtherBalance = await getEtherBalance(poa.address)
  const preFeeManagerEtherBalance = await getEtherBalance(fmr.address)

  const tx = await poa.payout(config)
  const gasUsed = await getGasUsed(tx)

  const postContractTotalTokenPayout = await poa.totalPerTokenPayout()
  const currentExpectedTotalTokenPayout = payoutValue
    .sub(_fee)
    .mul(1e18)
    .div(totalSupply)
    .floor()
  const expectedContractTotalTokenPayout = preContractTotalTokenPayout.add(
    currentExpectedTotalTokenPayout
  )
  const postCustodianEtherBalance = await getEtherBalance(custodian)
  const expectedCustodianEtherBalance = preCustodianEtherBalance
    .sub(gasPrice.mul(gasUsed))
    .sub(payoutValue)
  const postContractEtherBalance = await getEtherBalance(poa.address)
  const expectedContractEtherBalance = payoutValue.sub(fee)
  const postFeeManagerEtherBalance = await getEtherBalance(fmr.address)

  assert.equal(
    postContractTotalTokenPayout.toString(),
    expectedContractTotalTokenPayout.toString(),
    'totalPerTokenPayout should match the expected value'
  )
  assert.equal(
    expectedCustodianEtherBalance.toString(),
    postCustodianEtherBalance.toString(),
    'expected custodian ether balance should match actual after payout'
  )
  assert.equal(
    postContractEtherBalance.sub(preContractEtherBalance).toString(),
    expectedContractEtherBalance.toString(),
    'contact ether balance should be incremented by the payoutValue sub fees'
  )
  assert.equal(
    postFeeManagerEtherBalance.sub(preFeeManagerEtherBalance).toString(),
    fee.toString(),
    'FeeManager ether balance should be incremented by fee'
  )
}

const testClaim = async (poa, config, isTerminated) => {
  const claimer = config.from
  const stage = await poa.stage()
  const claimerClaimAmount = await poa.currentPayout(claimer, true)

  const preClaimerEtherBalance = await getEtherBalance(claimer)
  const preContractEtherBalance = await getEtherBalance(poa.address)

  const tx = await poa.claim({
    from: claimer,
    gasPrice
  })
  const gasUsed = tx.receipt.gasUsed || new BigNumber(0)
  const gasCost = gasPrice.mul(gasUsed)

  const postClaimerEtherBalance = await getEtherBalance(claimer)
  const postContractEtherBalance = await getEtherBalance(poa.address)

  const expectedClaimerEtherBalance = preClaimerEtherBalance
    .sub(gasCost)
    .add(claimerClaimAmount)

  assert.equal(
    expectedClaimerEtherBalance.toString(),
    postClaimerEtherBalance.toString(),
    'poaTokenHolder ether balance should match expected balance after claiming'
  )
  assert.equal(
    preContractEtherBalance.sub(postContractEtherBalance).toString(),
    claimerClaimAmount.toString(),
    'contract ether balance should be decremented by the claimerClaimAmount'
  )
  assert.equal(
    stage.toString(),
    isTerminated ? new BigNumber(5).toString() : new BigNumber(4).toString(),
    `stage should be in ${isTerminated ? 5 : 4}, Active`
  )
}

const testClaimAllPayouts = async (poa, poaTokenHolders) => {
  const stage = await poa.stage()
  assert.equal(
    stage.toString(),
    new BigNumber(4).toString(),
    'stage should be in 4, Active'
  )

  let totalClaimAmount = new BigNumber(0)

  for (const tokenHolder of poaTokenHolders) {
    const tokenHolderClaimAmount = await poa.currentPayout(tokenHolder, true)
    const preTokenHolderEtherBalance = await getEtherBalance(tokenHolder)
    const preContractEtherBalance = await getEtherBalance(poa.address)

    if (tokenHolderClaimAmount.greaterThan(0)) {
      const tx = await poa.claim({
        from: tokenHolder,
        gasPrice
      })

      const gasUsed = tx.receipt.gasUsed || new BigNumber(0)
      const gasCost = gasPrice.mul(gasUsed)
      const expectedTokenHolderEtherBalance = preTokenHolderEtherBalance
        .sub(gasCost)
        .add(tokenHolderClaimAmount)

      const postTokenHolderEtherBalance = await getEtherBalance(tokenHolder)
      const postContractEtherBalance = await getEtherBalance(poa.address)

      assert.equal(
        expectedTokenHolderEtherBalance.toString(),
        postTokenHolderEtherBalance.toString(),
        'poaTokenHolder ether balance should match expected balance after claiming'
      )
      assert.equal(
        preContractEtherBalance.sub(postContractEtherBalance).toString(),
        tokenHolderClaimAmount.toString(),
        'contract ether balance should be decremented by the tokenHolderClaimAmount'
      )
      totalClaimAmount = totalClaimAmount.add(tokenHolderClaimAmount)
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `⚠️ ${tokenHolder} has 0 claimable balances... this may happen due to current test setup, be sure that this is correct`
      )
    }
  }

  const finalContractEtherBalance = await getEtherBalance(poa.address)

  assert(
    totalClaimAmount.greaterThan(0),
    'total claim amount should be more than 0'
  )
  assert(
    areInRange(finalContractEtherBalance, new BigNumber(0), 1e2),
    `contract should have very small ether balance after all payouts have been claimed but ${finalContractEtherBalance} wei remain`
  )
}

const testFirstReclaim = async (poa, config, shouldBePending) => {
  const preStage = await poa.stage()

  assert.equal(
    preStage.toString(),
    shouldBePending ? new BigNumber(2).toString() : new BigNumber(1).toString(),
    `contract should be in stage ${
      shouldBePending ? '1 (funding)' : ' 2 (pending)'
    } before reclaiming`
  )

  await testReclaim(poa, config)

  const postStage = await poa.stage()

  assert.equal(
    postStage.toNumber(),
    3,
    'the contract should be in stage 2 (failed) after reclaiming'
  )
}

const fundingTimeoutContract = async poa => {
  const fundingTimeout = await poa.fundingTimeout()
  await timeTravel(fundingTimeout.toNumber())
}

const activationTimeoutContract = async poa => {
  const activationTimeout = await poa.activationTimeout()
  const fundingTimeout = await poa.fundingTimeout()
  await timeTravel(fundingTimeout.add(activationTimeout).toNumber())
}

const testSetFailed = async (poa, shouldBePending) => {
  const preStage = await poa.stage()

  await poa.setFailed()

  const postStage = await poa.stage()

  assert.equal(
    preStage.toString(),
    shouldBePending ? new BigNumber(2).toString() : new BigNumber(1).toString(),
    `preStage should be ${shouldBePending ? '2, Pending' : '1 Funding'}`
  )

  assert.equal(
    postStage.toString(),
    new BigNumber(3).toString(),
    'postStage should be 3, Failed'
  )
}

const testReclaim = async (poa, config) => {
  const claimer = config.from

  const preTotalSupply = await poa.totalSupply()
  const preContractEtherBalance = await getEtherBalance(poa.address)
  const preClaimerTokenBalance = await poa.balanceOf(claimer)
  const preClaimerEtherBalance = await getEtherBalance(claimer)
  const preOutstandingEtherBalance = await poa.investmentAmountPerUserInWei(
    claimer
  )

  const tx = await poa.reclaim({
    from: claimer,
    gasPrice
  })
  const gasUsed = await getGasUsed(tx)
  const gasCost = gasPrice.mul(gasUsed)

  const postTotalSupply = await poa.totalSupply()
  const postContractEtherBalance = await getEtherBalance(poa.address)
  const postClaimerTokenBalance = await poa.balanceOf(claimer)
  const postClaimerEtherBalance = await getEtherBalance(claimer)
  const postOutstandingEtherBalance = await poa.investmentAmountPerUserInWei(
    claimer
  )
  const expectedClaimerEtherBalance = preClaimerEtherBalance
    .sub(gasCost)
    .add(preOutstandingEtherBalance) // initialInvestAmount

  assert.equal(
    preTotalSupply.sub(postTotalSupply).toString(),
    preClaimerTokenBalance.toString(),
    'totalSupply should be deducted by claimer token balance'
  )
  assert.equal(
    preContractEtherBalance.sub(postContractEtherBalance).toString(),
    preOutstandingEtherBalance.toString(),
    'contract ether balance should be decremented by claimed outstanding balance'
  )
  assert.equal(
    postClaimerTokenBalance.toString(),
    new BigNumber(0).toString(),
    'claim token balance should be 0 after reclaiming'
  )
  assert.equal(
    postClaimerEtherBalance.toString(),
    expectedClaimerEtherBalance.toString(),
    'claimer should receive expected ether amount after reclaiming'
  )
  assert.equal(
    postOutstandingEtherBalance.toString(),
    new BigNumber(0).toString(),
    'claimer should have no outstanding balance after reclaiming'
  )
}

const testReclaimAll = async (poa, tokenHolders) => {
  for (const tokenHolder of tokenHolders) {
    const tokenBalance = await poa.balanceOf(tokenHolder)
    if (tokenBalance.greaterThan(0)) {
      await testReclaim(poa, { from: tokenHolder })
    }
  }

  const finalContractTotalSupply = await poa.totalSupply()
  const finalContractEtherBalance = await getEtherBalance(poa.address)

  assert.equal(
    finalContractTotalSupply.toString(),
    new BigNumber(0).toString(),
    'the final contract total supply should be 0 after all investors have reclaimed'
  )
  assert(
    areInRange(finalContractEtherBalance, new BigNumber(0), 10),
    'final contract ether balance should be within 10 wei of 0 after all investors have reclaimed'
  )
}

const testPaused = async (poa, shouldBePaused) => {
  const paused = await poa.paused()
  assert(shouldBePaused ? paused : !paused, 'contract should be paused')
}

const testPause = async (poa, config) => {
  await poa.pause(config)
  await testPaused(poa, true)
}

const testUnpause = async (poa, config) => {
  await poa.unpause(config)
  await testPaused(poa, false)
}

const testFallback = async config => {
  await testWillThrow(sendTransaction, [web3, config])
}

const testUpdateProofOfCustody = async (poa, ipfsHash, config) => {
  const preIpfsHash = await poa.proofOfCustody()

  await poa.updateProofOfCustody(ipfsHash, config)

  const postIpfsHash = await poa.proofOfCustody()

  assert(preIpfsHash != postIpfsHash, 'should not be same ipfsHash')
  assert.equal(postIpfsHash, ipfsHash, 'new ifpsHash should be set in contract')
}

const testTransfer = async (poa, to, value, args) => {
  assert(args.from, 'args.from not set!')
  const sender = args.from
  const receiver = to
  const transferAmount = value
  const preSenderBalance = await poa.balanceOf(sender)
  const preReceiverBalance = await poa.balanceOf(receiver)

  await poa.transfer(receiver, transferAmount, args)

  const postSenderBalance = await poa.balanceOf(sender)
  const postReceiverBalance = await poa.balanceOf(receiver)

  assert.equal(
    preSenderBalance.minus(postSenderBalance).toString(),
    transferAmount.toString(),
    'sender token balance should be decremented by the transferAmount'
  )
  assert.equal(
    postReceiverBalance.minus(preReceiverBalance).toString(),
    transferAmount.toString(),
    'receiver token balance should be incrementd by the transferAmount'
  )
}

const testApprove = async (poa, spender, value, args) => {
  assert(args.from, 'args.from not set!')
  const approver = args.from
  const preApproval = await poa.allowance(approver, spender)

  await poa.approve(spender, value, args)

  const postApproval = await poa.allowance(approver, spender)

  assert.equal(
    postApproval.minus(preApproval).toString(),
    value.toString(),
    'spender allowance for approver should be incremented by the value'
  )
}

const testTransferFrom = async (
  poa,
  allowanceOwner,
  receiver,
  value,
  config
) => {
  assert(!!config.from, 'config.from required!')
  const allowanceSpender = config.from

  const preOwnerTokenBalance = await poa.balanceOf(allowanceOwner)
  const preReceiverBalance = await poa.balanceOf(receiver)
  const preSpenderAllowance = await poa.allowance(
    allowanceOwner,
    allowanceSpender
  )

  await poa.transferFrom(allowanceOwner, receiver, value, config)

  const postOwnerTokenBalance = await poa.balanceOf(allowanceOwner)
  const postReceiverBalance = await poa.balanceOf(receiver)
  const postSpenderAllowance = await poa.allowance(
    allowanceOwner,
    allowanceSpender
  )

  assert.equal(
    preOwnerTokenBalance.minus(postOwnerTokenBalance).toString(),
    value.toString(),
    'the owner balance should be decremented by the transferFrom amount'
  )
  assert.equal(
    postReceiverBalance.minus(preReceiverBalance).toString(),
    value.toString(),
    'the spender balance should be incremented by the transferFrom amount'
  )
  assert.equal(
    preSpenderAllowance.minus(postSpenderAllowance).toString(),
    value.toString(),
    'the spender allowance should be decremented by the transferFrom amount'
  )
}

const testTerminate = async (poa, config) => {
  const preStage = await poa.stage()

  await poa.terminate(config)

  const postStage = await poa.stage()

  assert.equal(
    preStage.toString(),
    new BigNumber(4).toString(),
    'preStage should be 4, Active'
  )
  assert.equal(
    postStage.toString(),
    new BigNumber(5).toString(),
    'postStage should be 5, Terminated'
  )
}

const testChangeCustodianAddress = async (poa, newAddress, config) => {
  await poa.changeCustodianAddress(newAddress, config)

  const postAddress = await poa.custodian()

  assert.equal(postAddress, newAddress, 'custodian should be set to newAddress')
}

const testCurrentPayout = async (poa, account, expectedPayout) => {
  const currentPayout = await poa.currentPayout(account, true)

  assert(
    areInRange(currentPayout, expectedPayout, 1),
    'currentPayout should match expectedPayout'
  )
}

const getAccountInformation = async (poa, address) => {
  const etherBalance = await getEtherBalance(address)
  const tokenBalance = await poa.balanceOf(address)
  const perTokenBalance = await poa.currentPayout(address, false)
  const unclaimedBalance = await poa.unclaimedPayoutTotals(address)
  const currentPayout = await poa.currentPayout(address, true)

  return {
    etherBalance,
    tokenBalance,
    perTokenBalance,
    unclaimedBalance,
    currentPayout
  }
}

const testResetCurrencyRate = async (exr, exp, currencyType, rate) => {
  await testSetQueryId(exr, exp, currencyType)
  await testSetRate(exr, exp, rate, false)
}

module.exports = {
  accounts,
  owner,
  broker,
  custodian,
  bbkBonusAddress,
  bbkContributors,
  whitelistedPoaBuyers,
  bbkTokenDistAmount,
  actRate,
  defaultName,
  defaultSymbol,
  defaultFiatCurrency,
  defaultFundingTimeout,
  defaultActivationTimeout,
  defaultFundingGoal,
  defaultFiatRate,
  getDefaultStartTime,
  defaultIpfsHash,
  setupEcosystem,
  testSetCurrencyRate,
  setupPoaAndEcosystem,
  testInitialization,
  testWeiToFiatCents,
  testFiatCentsToWei,
  testWeiToTokens,
  testCalculateFee,
  testStartSale,
  testBuyTokens,
  determineNeededTimeTravel,
  testBuyRemainingTokens,
  testActivate,
  testBrokerClaim,
  testPayout,
  testClaim,
  testClaimAllPayouts,
  testFirstReclaim,
  testReclaim,
  fundingTimeoutContract,
  activationTimeoutContract,
  testSetFailed,
  testReclaimAll,
  testPaused,
  testPause,
  testUnpause,
  testFallback,
  testUpdateProofOfCustody,
  testTransfer,
  testApprove,
  testTransferFrom,
  testTerminate,
  testChangeCustodianAddress,
  testBuyTokensMulti,
  testCurrentPayout,
  getAccountInformation,
  testResetCurrencyRate,
  timeTravel
}
