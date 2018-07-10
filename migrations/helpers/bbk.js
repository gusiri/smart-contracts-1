const { getEtherBalance } = require('./general.js')
const distributeBbkToMany = (bbk, accounts, amount) =>
  Promise.all(accounts.map(account => bbk.distributeTokens(account, amount)))

const finalizeBbk = async (
  bbk,
  owner,
  fountainAddress,
  contributors,
  tokenDistAmount
) => {
  const ownerPreEtherBalance = await getEtherBalance(owner)

  await bbk.changeFountainContractAddress(fountainAddress, { from: owner })
  await distributeBbkToMany(bbk, contributors, tokenDistAmount)
  await bbk.finalizeTokenSale({ from: owner })
  await bbk.unpause({ from: owner })
  const ownerPostEtherBalance = await getEtherBalance(owner)

  const gasCost = ownerPreEtherBalance.sub(ownerPostEtherBalance)

  return { gasCost }
}

module.exports = {
  finalizeBbk
}
