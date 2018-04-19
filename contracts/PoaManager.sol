pragma solidity ^0.4.18;

// don't need to define Registry in this contract because it is already defined in PoaToken
import "./PoaToken.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";


contract PoaManager is Ownable {
  using SafeMath for uint256;

  Registry private registry;

  struct Broker {
    address _address;
    bool _active;
  }

  struct Token {
    address _address;
    bool _active;
  }

  // List of all brokers ever added: active or inactive
  Broker[] public brokers;
  // List of all tokens ever added: active or inactive
  Token[] public tokens;
  // Used to get index of an address in brokers array
  // TODO: consider using smaller uint... uint32 is 4.2 billion
  mapping (address => uint256) public brokerIndexMap;
  // to get index of a token in tokens array
  mapping (address => uint256) public tokenIndexMap;

  event BrokerAdded(address _broker);
  event BrokerStatusChanged(address _broker, bool _active);
  event TokenAdded(address _token);
  event TokenStatusChanged(address _token, bool _active);

  modifier onlyActiveBroker {
    require(brokers[brokerIndexMap[msg.sender]]._active);
    _;
  }

  modifier isNewBroker(address _brokerAddress) {
    require(brokerIndexMap[_brokerAddress] == uint256(0));
    _;
  }

  modifier brokerExists(address _brokerAddress) {
    require(brokerIndexMap[_brokerAddress] != uint256(0));
    _;
  }

  modifier tokenExists(address _tokenAddress) {
    require(_tokenAddress != address(0));
    require(tokenIndexMap[_tokenAddress] != uint256(0));
    _;
  }

  // Instantiate the PoaManager contract.
  function PoaManager(address _registry)
    public
  {
    require(_registry != address(0));
    registry = Registry(_registry);
    // ensure that 1st element of tokens is not active
    tokens.push(Token(address(0), false));
    brokers.push(Broker(address(0), false));
  }

  // List all active broker addresses
  function listBrokers()
    public
    view
    returns(address[], bool[])
  {
    address[] memory addresses = new address[](brokers.length);
    bool[] memory activeStatuses = new bool[](brokers.length);
    for (uint256 i = 0; i < brokers.length; i++) {
      Broker memory broker = brokers[i];
      addresses[i] = broker._address;
      activeStatuses[i] = broker._active;
    }
    return (addresses, activeStatuses);
  }

  function brokerStatus(address _brokerAddress)
    public
    view
    returns (bool)
  {
    return brokers[brokerIndexMap[_brokerAddress]]._active;
  }

  function getBroker(address _brokerAddress)
    public
    view
    returns (address, bool)
  {
    Broker memory broker = brokers[brokerIndexMap[_brokerAddress]];
    return (broker._address, broker._active);
  }

  // Add a broker: starts as active
  function addBroker(address _brokerAddress)
    public
    onlyOwner
    isNewBroker(_brokerAddress)
  {
    Broker memory broker = Broker(_brokerAddress, true);
    brokers.push(broker);
    brokerIndexMap[_brokerAddress] = brokers.length.sub(1);
    BrokerAdded(_brokerAddress);
  }

  // Set previously inactive broker to active
  function activateBroker(address _brokerAddress)
    public
    onlyOwner
    brokerExists(_brokerAddress)
    returns (bool)
  {
    uint256 _brokerIndex = brokerIndexMap[_brokerAddress];
    require(brokers[_brokerIndex]._active == false);
    brokers[_brokerIndex]._active = true;
    BrokerStatusChanged(_brokerAddress, true);
    return true;
  }

  // Set previously active broker to inactive
  function deactivateBroker(address _brokerAddress)
    public
    onlyOwner
    brokerExists(_brokerAddress)
    returns (bool)
  {
    uint256 _brokerIndex = brokerIndexMap[_brokerAddress];
    require(brokers[_brokerIndex]._active == true);
    brokers[_brokerIndex]._active = false;
    BrokerStatusChanged(_brokerAddress, false);
    return true;
  }

  // List all active broker addresses
  function listTokens()
    public
    view
    returns(address[], bool[])
  {
    address[] memory addresses = new address[](tokens.length);
    bool[] memory activeStatuses = new bool[](tokens.length);
    for (uint256 i = 0; i < tokens.length; i++) {
      Token memory token = tokens[i];
      addresses[i] = token._address;
      activeStatuses[i] = token._active;
    }
    return (addresses, activeStatuses);
  }

  function tokenStatus(address _tokenAddress)
    public
    view
    returns (bool)
  {
    return tokens[tokenIndexMap[_tokenAddress]]._active;
  }

  function getToken(address _tokenAddress)
    public
    view
    returns (address, bool)
  {
    Token memory token = tokens[tokenIndexMap[_tokenAddress]];
    return (token._address, token._active);
  }

  // Create a new POAToken contract with given parameters and add it to the list.
  function addToken
  (
    string _name,
    string _symbol,
    address _custodian,
    uint _timeout,
    uint256 _supply
  )
    public
    onlyActiveBroker
    returns (address)
  {
    address _tokenAddress = new PoaToken(
      _name,
      _symbol,
      msg.sender,
      _custodian,
      address(registry),
      _timeout,
      _supply
    );
    Token memory token = Token(_tokenAddress, true);
    tokens.push(token);
    tokenIndexMap[_tokenAddress] = tokens.length.sub(1);
    TokenAdded(_tokenAddress);
    return _tokenAddress;
  }

  // Set previously deactivated token to active
  function activateToken(address _tokenAddress)
    public
    onlyOwner
    tokenExists(_tokenAddress)
    returns (bool)
  {
    uint256 _tokenIndex = tokenIndexMap[_tokenAddress];
    require(tokens[_tokenIndex]._active == false);
    tokens[_tokenIndex]._active = true;
    TokenStatusChanged(_tokenAddress, false);
    return true;
  }

  // Set previously active token to inactive
  function deactivateToken(address _tokenAddress)
    public
    onlyOwner
    tokenExists(_tokenAddress)
    returns (bool)
  {
    uint256 _tokenIndex = tokenIndexMap[_tokenAddress];
    require(tokens[_tokenIndex]._active == true);
    tokens[_tokenIndex]._active = false;
    TokenStatusChanged(_tokenAddress, true);
    return true;
  }

  // Fallback function
  function()
    public
  {
    revert();
  }

}
