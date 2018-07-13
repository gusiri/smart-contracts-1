pragma solidity 0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


/**
  @title Contract for doing payouts to Brickblock employees on monthly basis.
*/
contract SalaryPayout is Ownable {
  using SafeMath for uint256;

  // mappings per employee
  mapping(address => uint256) private releasedTokens;
  mapping(address => uint256) private unReleasedTokens;
  mapping(address => uint256) private monthlySalary;

  uint256 public employeeStartTime;
  ERC20 token;

  constructor (ERC20 _token)
    public
  {
    token = _token;
  }

  function addEmployee (address _employee, uint256 _startingBalance)
    public
    onlyOwner
  {
    unReleasedTokens[_employee] = unReleasedTokens[_employee].add(_startingBalance);
  }

  function getUnclaimedPayoutBalance()
    public
    view
    returns(uint256)
  {
    return(unReleasedTokens[msg.sender]);
  }

  function calculateUnclaimedPayout(address _employee) private returns(uint256) {
    
  }

  function claimPayout()
    public
  {
    uint256 amount = unReleasedTokens[msg.sender];
    unReleasedTokens[msg.sender].sub(amount);
    releasedTokens[msg.sender].add(amount);
    token.transfer(msg.sender, amount);
  }

}