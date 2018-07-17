// BonusPayout Helper

//const BigNumber = require('bignumber.js')

const testAddEmployee = async (
  bbk,
  bpo,
  employee,
  quarterlyAmount,
  startingBalance
) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(bpo.address)
  await bpo.addEmployee(employee, quarterlyAmount, 0)
  const [
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index,
    isActive
  ] = await bpo.employeeList(employee)
  const postBonusContractBbkBalance = await bbk.balanceOf(bpo.address)

  const expectedBonusContractBalance = preBonusContractBbkBalance.minus(
    quarterlyAmount
  )

  assert(
    postBonusContractBbkBalance.toString(),
    expectedBonusContractBalance.toString(),
    'Bonus contrac balance does not match with the expected'
  )

  assert(
    employeeStartingBalance.toString(),
    startingBalance.toString(),
    'Starting balance is not zero'
  )

  assert(
    employeeQuarterlyAmount.toString(),
    quarterlyAmount.toString(),
    'Quarterly amount does not match'
  )

  assert(isActive.toString(), 'true', 'Employee is not set to active')

  return {
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index,
    isActive
  }
}

module.exports = {
  testAddEmployee
}
