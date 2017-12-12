pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/token/PausableToken.sol";


contract BrickblockToken is PausableToken {

  string public constant name = "BrickblockToken";
  string public constant symbol = "BBK";
  uint256 public constant initialSupply = 500 * (10 ** 6) * (10 ** uint256(decimals));
  uint8 public constant contributorsShare = 51;
  uint8 public constant companyShare = 35;
  uint8 public constant bonusShare = 14;
  uint8 public constant decimals = 18;
  address public bonusDistributionAddress;
  address public fountainContractAddress;
  address public successorAddress;
  address public predecessorAddress;
  bool public tokenSaleActive;
  bool public dead;

  event TokenSaleFinished(uint256 totalSupply, uint256 distributedTokens,  uint256 bonusTokens, uint256 companyTokens);
  event Burn(address indexed burner, uint256 value);
  event Upgrade(address successorAddress);
  event Evacuated(address user);
  event Rescued(address user, uint256 rescuedBalance, uint256 newBalance);

  modifier only(address caller) {
    require(msg.sender == caller);
    _;
  }

  // need to make sure that no more than 51% of total supply is bought
  modifier supplyAvailable(uint256 _value) {
    uint256 _distributedTokens = initialSupply.sub(balances[this]);
    uint256 _maxDistributedAmount = initialSupply.mul(contributorsShare).div(100);
    require(_distributedTokens.add(_value) <= _maxDistributedAmount);
    _;
  }

  function BrickblockToken(address _predecessorAddress)
    public
  {
    // need to start paused to make sure that there can be no transfers until dictated by company
    paused = true;

    // if contract is an upgrade
    if (_predecessorAddress != address(0)) {
      // take the initialization variables from predecessor state
      predecessorAddress = _predecessorAddress;
      BrickblockToken predecessor = BrickblockToken(_predecessorAddress);
      balances[this] = predecessor.balanceOf(_predecessorAddress);
      Transfer(address(0), this, predecessor.balanceOf(_predecessorAddress));
      // the total supply starts with the balance of the contract itself and rescued funds will be added to this
      totalSupply = predecessor.balanceOf(_predecessorAddress);
      tokenSaleActive = predecessor.tokenSaleActive();
      bonusDistributionAddress = predecessor.bonusDistributionAddress();
      fountainContractAddress = predecessor.fountainContractAddress();
      // if contract is NOT an upgrade
    } else {
      // first contract, easy setup
      totalSupply = initialSupply;
      balances[this] = initialSupply;
      Transfer(address(0), this, initialSupply);
      tokenSaleActive = true;
    }
  }

  function unpause()
    public
    onlyOwner
    whenPaused
  {
    require(dead == false);
    super.unpause();
  }

  function isContract(address addr)
    private
    view
    returns (bool)
  {
    uint _size;
    assembly { _size := extcodesize(addr) }
    return _size > 0;
  }

  // decide which wallet to use to distribute bonuses at a later date
  function changeBonusDistributionAddress(address _newAddress)
    public
    onlyOwner
    returns (bool)
  {
    require(_newAddress != address(this));
    bonusDistributionAddress = _newAddress;
    return true;
  }

  // fountain contract might change over time... need to be able to change it
  function changeFountainContractAddress(address _newAddress)
    public
    onlyOwner
    returns (bool)
  {
    require(isContract(_newAddress));
    require(_newAddress != address(this));
    require(_newAddress != owner);
    fountainContractAddress = _newAddress;
    return true;
  }

  // custom transfer function that can be used while paused. Cannot be used after end of token sale
  function distributeTokens(address _contributor, uint256 _value)
    public
    onlyOwner
    supplyAvailable(_value)
    returns (bool)
  {
    require(tokenSaleActive == true);
    require(_contributor != address(0));
    require(_contributor != owner);
    balances[this] = balances[this].sub(_value);
    balances[_contributor] = balances[_contributor].add(_value);
    Transfer(this, _contributor, _value);
    return true;
  }

  // Calculate the shares for company, bonus & contibutors based on the intiial 50mm number - not what is left over after burning
  function finalizeTokenSale()
    public
    onlyOwner
    returns (bool)
  {
    // ensure that sale is active. is set to false at the end. can only be performed once.
    require(tokenSaleActive == true);
    // ensure that bonus address has been set
    require(bonusDistributionAddress != address(0));
    // ensure that fountainContractAddress has been set
    require(fountainContractAddress != address(0));
    uint256 _distributedTokens = initialSupply.sub(balances[this]);
    // company amount for company (35%)
    uint256 _companyTokens = initialSupply.mul(companyShare).div(100);
    // token amount for internal bonuses based on totalSupply (14%)
    uint256 _bonusTokens = initialSupply.mul(bonusShare).div(100);
    // need to do this in order to have accurate totalSupply due to integer division
    uint256 _newTotalSupply = _distributedTokens.add(_bonusTokens.add(_companyTokens));
    // unpurchased amount of tokens which will be burned
    uint256 _burnAmount = totalSupply.sub(_newTotalSupply);
    // distribute bonusTokens to distribution address
    balances[this] = balances[this].sub(_bonusTokens);
    balances[bonusDistributionAddress] = balances[bonusDistributionAddress].add(_bonusTokens);
    Transfer(this, bonusDistributionAddress, _bonusTokens);
    // leave remaining balance for company to be claimed at later date
    balances[this] = balances[this].sub(_burnAmount);
    Burn(this, _burnAmount);
    // set the company tokens to be allowed by fountain addresse
    allowed[this][fountainContractAddress] = _companyTokens;
    Approval(this, fountainContractAddress, _companyTokens);
    // set new totalSupply
    totalSupply = _newTotalSupply;
    // lock out this function from running ever again
    tokenSaleActive = false;
    // event showing sale is finished
    TokenSaleFinished(
      totalSupply,
      _distributedTokens,
      _bonusTokens,
      _companyTokens
    );
    // everything went well return true
    return true;
  }

  // this method will be called by the successor, it can be used to query the token balance,
  // but the main goal is to remove the data in the now dead contract,
  // to disable anyone to get rescued more that once
  // approvals are not included due to data structure
  function evacuate(address _user)
    public
    only(successorAddress)
    returns (bool)
  {
    require(dead);
    uint256 _balance = balances[_user];
    balances[_user] = 0;
    totalSupply = totalSupply.sub(_balance);
    Evacuated(_user);
    return true;
  }

  // to upgrade our contract
  // we set the successor, who is allowed to empty out the data
  // it then will be dead
  // it will be paused to dissallow transfer of tokens
  function upgrade(address _successorAddress)
    public
    onlyOwner
    returns (bool)
  {
    require(_successorAddress != address(0));
    require(isContract(_successorAddress));
    successorAddress = _successorAddress;
    dead = true;
    paused = true;
    Upgrade(successorAddress);
    return true;
  }

  // each user should call rescue once after an upgrade to evacuate his balance from the predecessor
  // the allowed mapping will be lost
  // if this is called multiple times it won't throw, but the balance will not change
  // this enables us to call it befor each method changeing the balances
  // (this might be a bad idea due to gas-cost and overhead)
  function rescue()
    public
    returns (bool)
  {
    require(predecessorAddress != address(0));
    address _user = msg.sender;
    BrickblockToken predecessor = BrickblockToken(predecessorAddress);
    uint256 _oldBalance = predecessor.balanceOf(_user);
    if (_oldBalance > 0) {
      balances[_user] = balances[_user].add(_oldBalance);
      totalSupply = totalSupply.add(_oldBalance);
      predecessor.evacuate(_user);
      Rescued(_user, _oldBalance, balances[_user]);
      return true;
    }
    return false;
  }

  // fallback function - do not allow any eth transfers to this contract
  function()
    public
  {
    revert();
  }

}
