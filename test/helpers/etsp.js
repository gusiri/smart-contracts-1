// EmployeeTokenSalaryPayout Helper

const BigNumber = require('bignumber.js')
const { waitForEvent, getReceipt } = require('./general')

const testAddEmployee = async (
  etsp,
  employee,
  quarterlyAmount,
  startingBalance,
  config
) => {
  await etsp.addEmployee(employee, quarterlyAmount, startingBalance, config)
  const [
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index
  ] = await etsp.employees(employee)

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

  return {
    startingBalance,
    quarterlyAmount,
    index
  }
}

const testAddManyEmployee = async (
  etsp,
  employees,
  quarterlyAmount,
  startingBalance,
  config
) => {
  for (let index = 0; index < employees.length; index++) {
    const employee = employees[index]
    await testAddEmployee(
      etsp,
      employee,
      quarterlyAmount,
      startingBalance,
      config
    )
  }
}

const testRemoveEmployee = async (
  bbk,
  etsp,
  employee,
  endingBalance,
  config
) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(etsp.address)
  const preEmployeeBbkBalance = await bbk.balanceOf(employee)
  await etsp.removeEmployee(employee, endingBalance, config)

  const employeeData = await getEmployeeData(etsp, employee)
  const postBonusContractBbkBalance = await bbk.balanceOf(etsp.address)
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

  return employeeData
}

const testPayout = async (bbk, etsp, employees, config) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(etsp.address)
  let expectedTotalDistroAmount = new BigNumber(0)

  //collect employee data before payout
  const preEmployeeObject = []

  for (let index = 0; index < employees.length; index++) {
    const employeeAddress = employees[index]
    const employeeData = await getEmployeeData(etsp, employeeAddress)
    employeeData.balance = await bbk.balanceOf(employeeAddress)
    employeeData.expectedBalanceAfterPayout = employeeData.balance
      .plus(employeeData.startingBalance)
      .plus(employeeData.quarterlyAmount)

    expectedTotalDistroAmount = expectedTotalDistroAmount.plus(
      employeeData.expectedBalanceAfterPayout
    )
    preEmployeeObject.push(employeeData)
  }

  const txHash = await etsp.distributePayouts(config)
  const tx = await getReceipt(txHash)

  //collect employee data after payout
  const postEmployeeObject = []
  for (let index = 0; index < employees.length; index++) {
    const employeeAddress = employees[index]
    const employeeData = await getEmployeeData(etsp, employeeAddress)
    employeeData.balance = await bbk.balanceOf(employeeAddress)
    postEmployeeObject.push(employeeData)
  }

  const postBonusContractBbkBalance = await bbk.balanceOf(etsp.address)
  const { args: distributeEvent } = await waitForEvent(etsp.DistributeEvent())
  const expectedBonusContractBalance = preBonusContractBbkBalance.minus(
    expectedTotalDistroAmount
  )

  for (let index = 0; index < employees.length; index++) {
    const currentPreEmployeeObject = preEmployeeObject[index]
    const currentPostEmployeeObject = postEmployeeObject[index]

    assert.equal(
      currentPostEmployeeObject.balance.toString(),
      currentPreEmployeeObject.expectedBalanceAfterPayout.toString(),
      'Expected balance does not match for user after payout'
    )
  }

  assert.equal(
    postBonusContractBbkBalance.toString(),
    expectedBonusContractBalance.toString(),
    'Bonus contract balance does not match with the expected'
  )

  assert.equal(
    distributeEvent.amount.toString(),
    expectedTotalDistroAmount.toString(),
    'Total distributed payout amount should match the expected'
  )

  return {
    payoutAmount: distributeEvent.amount,
    gasUsed: tx.gasUsed
  }
}

const getEmployeeData = async (etsp, employeeAddress) => {
  const [startingBalance, quarterlyAmount, index] = await etsp.employees(
    employeeAddress
  )

  return {
    startingBalance,
    quarterlyAmount,
    index
  }
}

module.exports = {
  testAddEmployee,
  testAddManyEmployee,
  testRemoveEmployee,
  testPayout
}
