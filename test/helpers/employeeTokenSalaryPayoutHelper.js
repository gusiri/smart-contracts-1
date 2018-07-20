// EmployeeTokenSalaryPayout Helper

const BigNumber = require('bignumber.js')
const { waitForEvent, getReceipt } = require('./general')

const testAddEmployee = async (
  employeeTokenSalaryPayoutContract,
  employee,
  quarterlyAmount,
  startingBalance,
  config
) => {
  await employeeTokenSalaryPayoutContract.addEmployee(
    employee,
    quarterlyAmount,
    startingBalance,
    config
  )
  const [
    employeeStartingBalance,
    employeeQuarterlyAmount,
    index
  ] = await employeeTokenSalaryPayoutContract.employees(employee)

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
  employeeTokenSalaryPayoutContract,
  employees,
  quarterlyAmount,
  startingBalance,
  config
) => {
  for (let index = 0; index < employees.length; index++) {
    const employee = employees[index]
    await testAddEmployee(
      employeeTokenSalaryPayoutContract,
      employee,
      quarterlyAmount,
      startingBalance,
      config
    )
  }
}

const testRemoveEmployee = async (
  bbk,
  employeeTokenSalaryPayoutContract,
  employee,
  endingBalance,
  config
) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(
    employeeTokenSalaryPayoutContract.address
  )
  const preEmployeeBbkBalance = await bbk.balanceOf(employee)
  await employeeTokenSalaryPayoutContract.removeEmployee(
    employee,
    endingBalance,
    config
  )

  const employeeData = await getEmployeeData(
    employeeTokenSalaryPayoutContract,
    employee
  )
  const postBonusContractBbkBalance = await bbk.balanceOf(
    employeeTokenSalaryPayoutContract.address
  )
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

const testPayout = async (
  bbk,
  employeeTokenSalaryPayoutContract,
  employees,
  config
) => {
  const preBonusContractBbkBalance = await bbk.balanceOf(
    employeeTokenSalaryPayoutContract.address
  )
  let expectedTotalDistroAmount = new BigNumber(0)

  //collect employee data before payout
  const preEmployeeObject = []

  for (let index = 0; index < employees.length; index++) {
    const employeeAddress = employees[index]
    const employeeData = await getEmployeeData(
      employeeTokenSalaryPayoutContract,
      employeeAddress
    )
    employeeData.balance = await bbk.balanceOf(employeeAddress)
    employeeData.expectedBalanceAfterPayout = employeeData.balance
      .plus(employeeData.startingBalance)
      .plus(employeeData.quarterlyAmount)

    expectedTotalDistroAmount = expectedTotalDistroAmount.plus(
      employeeData.expectedBalanceAfterPayout
    )
    preEmployeeObject.push(employeeData)
  }

  const txHash = await employeeTokenSalaryPayoutContract.distributePayouts(
    config
  )
  const tx = await getReceipt(txHash)

  //collect employee data after payout
  const postEmployeeObject = []
  for (let index = 0; index < employees.length; index++) {
    const employeeAddress = employees[index]
    const employeeData = await getEmployeeData(
      employeeTokenSalaryPayoutContract,
      employeeAddress
    )
    employeeData.balance = await bbk.balanceOf(employeeAddress)
    postEmployeeObject.push(employeeData)
  }

  const postBonusContractBbkBalance = await bbk.balanceOf(
    employeeTokenSalaryPayoutContract.address
  )
  const { args: distributeEvent } = await waitForEvent(
    employeeTokenSalaryPayoutContract.DistributeEvent()
  )
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

const getEmployeeData = async (
  employeeTokenSalaryPayoutContract,
  employeeAddress
) => {
  const [
    startingBalance,
    quarterlyAmount,
    index
  ] = await employeeTokenSalaryPayoutContract.employees(employeeAddress)

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
