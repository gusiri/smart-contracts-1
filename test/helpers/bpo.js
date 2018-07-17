// BonusPayout Helper

//const BigNumber = require('bignumber.js')
const { waitForEvent, gasPrice } = require('./general')

const testAddEmployee = async (
  bpo,
  employee,
  quarterlyAmount,
  startingBalance = 0
) => {
  await bpo.addEmployee(employee, quarterlyAmount, startingBalance)
  const [
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index,
    isActive
  ] = await bpo.employeeList(employee)

  assert.equal(
    employeeStartingBalance.toString(),
    startingBalance.toString(),
    'Starting balance does not match'
  )

  assert.equal(
    employeeQuarterlyAmount.toString(),
    quarterlyAmount.toString(),
    'Quarterly amount does not match'
  )

  assert.equal(isActive.toString(), 'true', 'Employee is not set to active')

  return {
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index,
    isActive
  }
}

const testAddManyEmployee = async (
  bpo,
  employees,
  quarterlyAmount,
  startingBalance = 0
) => {
  for (let index = 0; index < employees.length; index++) {
    const employee = employees[index]
    await testAddEmployee(bpo, employee, quarterlyAmount, startingBalance)
  }
}

const testRemoveEmployee = async (bbk, bpo, employee, endingBalance = 0) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(bpo.address)
  const preEmployeeBbkBalance = await bbk.balanceOf(employee)
  await bpo.removeEmployee(employee, endingBalance)
  const [
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index,
    isActive
  ] = await bpo.employeeList(employee)
  const postBonusContractBbkBalance = await bbk.balanceOf(bpo.address)
  const postEmployeeBbkBalance = await bbk.balanceOf(employee)

  const expectedBonusContractBalance = preBonusContractBbkBalance.minus(
    endingBalance
  )

  const expectedEmployeeBalance = preEmployeeBbkBalance.plus(endingBalance)

  assert.equal(
    postBonusContractBbkBalance.toString(),
    expectedBonusContractBalance.toString(),
    'Bonus contract balance does not match with the expected'
  )

  assert.equal(
    postEmployeeBbkBalance.toString(),
    expectedEmployeeBalance.toString(),
    'Employee balance does not match with the expected.'
  )

  assert.equal(isActive.toString(), 'false', 'Employee is not set to false')
}

const testPayout = async (bbk, bpo) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(bpo.address)
  const tx = await bpo.distributePayouts()
  const postBonusContractBbkBalance = await bbk.balanceOf(bpo.address)
  console.log(JSON.stringify(tx, null, 4))
  const { args: distributeEvent } = await waitForEvent(bpo.DistributeEvent())
  // const expectedBonusContractBalance = preBonusContractBbkBalance.minus()

}

module.exports = {
  testAddEmployee,
  testAddManyEmployee,
  testRemoveEmployee,
  testPayout
}
