pragma solidity 0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


/**
  @title Contract for doing payouts to Brickblock employees on monthly basis.
*/
contract BonusPayout is Ownable {
  using SafeMath for uint256;

  //Events
  event DistributeEvent(uint256 timestamp, uint256 amount);
  event AddEmployeeEvent(address _address, uint256 timestamp);
  event RemoveEmployeeEven(address _address, uint256 timestamp);
  event ChangeQuarterlyAmountEvent(address _address, uint256 timestamp, uint256 newAmount);

  struct EmployeeStruct {
    uint256 startingBalance;
    uint256 quarterlyAmount;
    uint256 index;
    bool isActive;
  }


  mapping(address => EmployeeStruct) public employeeList;
  address[] public addressIndexes;

  ERC20 token;
  
  constructor (ERC20 _token)
    public
  {
    require(_token != address(0));

    token = _token;
  }

  function addEmployee (
    address _beneficiary, uint256 _quarterlyAmount, uint256 _startingBalance
  )
    public
    onlyOwner
    returns(bool)
  {
    EmployeeStruct storage employee = employeeList[_beneficiary];

    require(employee.isActive == false);
    addressIndexes.push(_beneficiary);
    employee.startingBalance = _startingBalance;
    employee.quarterlyAmount = _quarterlyAmount;
    employee.index = addressIndexes.length-1;

    employee.isActive = true;

    return true;
  }

  function removeEmployee (address _beneficiary, uint256 _endingBalance)
    public
    onlyOwner
  {
    EmployeeStruct memory deletedUser = employeeList[_beneficiary];
    require(deletedUser.isActive == true);

    require(payout(_beneficiary, _endingBalance));

    // if index is not the last entry
    if (deletedUser.index != addressIndexes.length-1) {
      // delete addressIndexes[deletedUser.index];
      // last EmployeeStruct
      address lastAddress = addressIndexes[addressIndexes.length-1];
      addressIndexes[deletedUser.index] = lastAddress;
      employeeList[lastAddress].index = deletedUser.index; 
    }
    delete employeeList[_beneficiary];
    addressIndexes.length--;
  }

  function updateQuarterlyAmount(address _beneficiary, uint256 newAmount)
    public
    onlyOwner
  {
    employeeList[_beneficiary].quarterlyAmount = newAmount;
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
  
    for (uint i = 0; i < addressIndexes.length; i++) {
      address _address = addressIndexes[i];
      uint256 _amount = employeeList[_address].quarterlyAmount;
  
      if (employeeList[_address].startingBalance != 0) {
        _amount = _amount.add(employeeList[_address].startingBalance);
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
  
    for (uint i = 0; i < addressIndexes.length; i++) {
      address _address = addressIndexes[i];
      uint256 _amount = employeeList[_address].quarterlyAmount;
  
      if (employeeList[_address].startingBalance != 0) {
        _amount = _amount.add(employeeList[_address].startingBalance);
        employeeList[_address].startingBalance = 0;
      }
      totalAmount = totalAmount.add(_amount);
      payout(_address, _amount);
    }

    // solium-disable-next-line security/no-block-members
    emit DistributeEvent(block.timestamp, totalAmount);
  }

  function claim(uint256 _amount)
    public
    onlyOwner
  {
    token.transfer(owner, _amount);
  }

  function claimAll()
    public
    onlyOwner
  {
    uint256 amount = token.balanceOf(address(this));
    token.transfer(owner, amount);
  }
}
