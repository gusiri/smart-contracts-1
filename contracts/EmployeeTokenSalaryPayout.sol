pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./interfaces/IBrickblockToken.sol";


/**
  @title Contract for doing payouts to Brickblock employees on quarterly basis.
*/
contract EmployeeTokenSalaryPayout is Ownable {
  using SafeMath for uint256;

  // Events
  event DistributeEvent(uint256 timestamp, uint256 amount);
  event AddEmployeeEvent(address indexed _address, uint256 timestamp);
  event RemoveEmployeeEvent(address indexed _address, uint256 timestamp);
  event ChangeQuarterlyAmountEvent(address indexed _address, uint256 timestamp, uint256 newAmount);

  struct Employee {
    uint256 startingBalance;
    uint256 quarterlyAmount;
    uint256 index;
  }


  mapping(address => Employee) public employees;
  address[] public employeeAddressList;

  IBrickblockToken token;
  
  constructor (IBrickblockToken _token)
    public
  {
    require(_token != address(0));

    token = _token;
  }

  function addEmployee (
    address _beneficiary,
    uint256 _quarterlyAmount,
    uint256 _startingBalance
  )
    public
    onlyOwner
    returns(bool)
  {
    Employee storage employee = employees[_beneficiary];

    require(_beneficiary != address(0));
    require(_quarterlyAmount > 0);
    require(employee.quarterlyAmount == 0);

    employeeAddressList.push(_beneficiary);
    employee.startingBalance = _startingBalance;
    employee.quarterlyAmount = _quarterlyAmount;
    employee.index = employeeAddressList.length-1;

    // solium-disable-next-line security/no-block-members
    emit AddEmployeeEvent(_beneficiary, block.timestamp);

    return true;
  }

  function removeEmployee (address _beneficiary, uint256 _endingBalance)
    public
    onlyOwner
    returns(bool)
  {
    Employee memory deletedUser = employees[_beneficiary];

    require(_beneficiary != address(0));
    require(deletedUser.quarterlyAmount > 0);
    require(payout(_beneficiary, _endingBalance));

    // if index is not the last entry
    // swap deleted user index with the last one
    if (deletedUser.index != employeeAddressList.length-1) {
      address lastAddress = employeeAddressList[employeeAddressList.length-1];
      employeeAddressList[deletedUser.index] = lastAddress;
      employees[lastAddress].index = deletedUser.index; 
    }
    delete employees[_beneficiary];
    employeeAddressList.length--;
    // solium-disable-next-line security/no-block-members
    emit RemoveEmployeeEvent(_beneficiary, block.timestamp);

    return true;
  }

  function updateQuarterlyAmount(address _beneficiary, uint256 newAmount)
    public
    onlyOwner
    returns(bool)
  {
    require(_beneficiary != address(0));
    require(newAmount > 0);
    employees[_beneficiary].quarterlyAmount = newAmount;

    // solium-disable-next-line security/no-block-members
    emit ChangeQuarterlyAmountEvent(_beneficiary, block.timestamp, newAmount);

    return true;
  }

  function payout(address _beneficiary, uint256 _bbkAmount)
    private
    returns(bool)
  {
    return(token.transfer(_beneficiary, _bbkAmount));
  }

  function getTotalPayoutAmount()
    public
    view
    returns(uint256)
  {
    uint256 totalAmount;
  
    for (uint i = 0; i < employeeAddressList.length; i++) {
      address _address = employeeAddressList[i];
      uint256 _amount = employees[_address].quarterlyAmount;
  
      if (employees[_address].startingBalance != 0) {
        _amount = _amount.add(employees[_address].startingBalance);
      }
      totalAmount = totalAmount.add(_amount);
    }

    return totalAmount;
  }

  function distributePayouts()
    public
    onlyOwner
  {
    uint256 totalAmount;
  
    for (uint i = 0; i < employeeAddressList.length; i++) {
      address _address = employeeAddressList[i];
      uint256 _amount = employees[_address].quarterlyAmount;

      if (employees[_address].startingBalance != 0) {
        _amount = _amount.add(employees[_address].startingBalance);
        employees[_address].startingBalance = 0;
      }
      totalAmount = totalAmount.add(_amount);
      payout(_address, _amount);
    }

    // solium-disable-next-line security/no-block-members
    emit DistributeEvent(block.timestamp, totalAmount);
  }

  function claimAll()
    public
    onlyOwner
  {
    uint256 amount = token.balanceOf(address(this));
    token.transfer(owner, amount);
  }
}
