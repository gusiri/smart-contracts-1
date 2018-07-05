pragma solidity 0.4.23;

import "./PoaProxyCommon.sol";

/* solium-disable security/no-block-members */
/* solium-disable security/no-low-level-calls */


contract PoaCommon is PoaProxyCommon {


  // ‰ permille NOT percent: fee paid to BBK holders through ACT
  uint256 public constant feeRate = 5;

  enum Stages {
    PreFunding, // 0
    FiatFunding, // 1
    EthFunding, // 2
    Pending, // 3
    Failed,  // 4
    Active, // 5
    Terminated, // 6
    Cancelled // 7
  }

  //
  // start common non-sequential storage pointers
  //

  // represents slot for: Stage
  bytes32 internal constant stageSlot = keccak256("stage");
  // represents slot for: address
  bytes32 internal constant custodianSlot = keccak256("custodian");
  // represents slot for: bytes32[2] TODO: probably need to fix getters/setters
  bytes32 internal constant proofOfCustody32Slot = keccak256("proofOfCustody32");
  // represents slot for: uint256
  bytes32 internal constant totalSupplySlot = keccak256("totalSupply");
  // represents slot for: uint256
  bytes32 internal constant fundedAmountInTokensDuringFiatFundingSlot = 
  keccak256("fundedAmountInTokensDuringFiatFunding");
  // represents slot for: mapping(address => uint256)
  bytes32 internal constant fiatInvestmentPerUserInTokensSlot = 
  keccak256("fiatInvestmentPerUserInTokens");
  // represents slot for: uint256
  bytes32 internal constant fundedAmountInWeiSlot = keccak256("fundedAmountInWei");
  // represents slot for: mapping(address => uint256)
  bytes32 internal constant investmentAmountPerUserInWeiSlot = 
  keccak256("investmentAmountPerUserInWei");
  // represents slot for: mapping(address => uint256)
  bytes32 internal constant unclaimedPayoutTotalsSlot = keccak256("unclaimedPayoutTotals");
  bytes32 internal constant pausedSlot = keccak256("paused");
  bytes32 internal constant tokenInitializedSlot = keccak256("tokenInitialized");

  //
  // end common non-sequential storage pointers
  //

  //
  // start common modifiers
  //

  modifier onlyCustodian() {
    require(msg.sender == custodian());
    _;
  }

  modifier atStage(Stages _stage) {
    require(stage() == _stage);
    _;
  }

  modifier atEitherStage(Stages _stage, Stages _orStage) {
    require(stage() == _stage || stage() == _orStage);
    _;
  }

  modifier validIpfsHash(bytes32[2] _ipfsHash) {
    // check that the most common hashing algo is used sha256
    // and that the length is correct. In theory it could be different
    // but use of this functionality is limited to only custodian
    // so this validation should suffice
    bytes memory _ipfsHashBytes = bytes(to64LengthString(_ipfsHash));
    require(_ipfsHashBytes.length == 46);
    require(_ipfsHashBytes[0] == 0x51);
    require(_ipfsHashBytes[1] == 0x6D);
    require(keccak256(_ipfsHashBytes) != keccak256(bytes(proofOfCustody())));
    _;
  }

  //
  // end common modifiers
  //

  //
  // start regular getters
  //

  function proofOfCustody()
    public
    view
    returns (string)
  {
    return to64LengthString(proofOfCustody32());
  }

  //
  // end regular getters
  //

  //
  // start common utility functions
  //

  // gets a given contract address by bytes32 saving gas
  function getContractAddress
  (
    string _name
  )
    public
    view
    returns (address _contractAddress)
  {
    bytes4 _sig = bytes4(keccak256("getContractAddress32(bytes32)"));
    bytes32 _name32 = keccak256(_name);
    address _registry = registry();

    assembly {
      let _call := mload(0x40)          // set _call to free memory pointer
      mstore(_call, _sig)               // store _sig at _call pointer
      mstore(add(_call, 0x04), _name32) // store _name32 at _call offset by 4 bytes for pre-existing _sig

      // staticcall(g, a, in, insize, out, outsize) => 0 on error 1 on success
      let success := staticcall(
        gas,    // g = gas: whatever was passed already
        _registry,  // a = address: address in storage
        _call,  // in = mem in  mem[in..(in+insize): set to free memory pointer
        0x24,   // insize = mem insize  mem[in..(in+insize): size of sig (bytes4) + bytes32 = 0x24
        _call,   // out = mem out  mem[out..(out+outsize): output assigned to this storage address
        0x20    // outsize = mem outsize  mem[out..(out+outsize): output should be 32byte slot (address size = 0x14 <  slot size 0x20)
      )

      // revert if not successful
      if iszero(success) {
        revert(0, 0)
      }

      _contractAddress := mload(_call) // assign result to return value
      mstore(0x40, add(_call, 0x24)) // advance free memory pointer by largest _call size
    }
  }

    // use assembly in order to avoid gas usage which is too high
  // used to check if whitelisted at Whitelist contract
  function checkIsWhitelisted
  (
    address _address
  )
    public
    view
    returns (bool _isWhitelisted)
  {
    bytes4 _sig = bytes4(keccak256("whitelisted(address)"));
    address _whitelistContract = getContractAddress("Whitelist");
    address _arg = _address;

    assembly {
      let _call := mload(0x40) // set _call to free memory pointer
      mstore(_call, _sig) // store _sig at _call pointer
      mstore(add(_call, 0x04), _arg) // store _arg at _call offset by 4 bytes for pre-existing _sig

      // staticcall(g, a, in, insize, out, outsize) => 0 on error 1 on success
      let success := staticcall(
        gas,    // g = gas: whatever was passed already
        _whitelistContract,  // a = address: _whitelist address assigned from getContractAddress()
        _call,  // in = mem in  mem[in..(in+insize): set to _call pointer
        0x24,   // insize = mem insize  mem[in..(in+insize): size of sig (bytes4) + bytes32 = 0x24
        _call,   // out = mem out  mem[out..(out+outsize): output assigned to this storage address
        0x20    // outsize = mem outsize  mem[out..(out+outsize): output should be 32byte slot (bool size = 0x01 < slot size 0x20)
      )

      // revert if not successful
      if iszero(success) {
        revert(0, 0)
      }

      _isWhitelisted := mload(_call) // assign result to returned value
      mstore(0x40, add(_call, 0x24)) // advance free memory pointer by largest _call size
    }
  }

  // takes a single bytes32 and returns a max 32 char long string
  function to32LengthString(
    bytes32 _data
  )
    pure
    internal
    returns (string)
  {
    // create new empty bytes array with same length as input
    bytes memory _bytesString = new bytes(32);
    // keep track of string length for later usage in trimming
    uint256 _stringLength;

    // loop through each byte in bytes32
    for (uint _bytesCounter = 0; _bytesCounter < 32; _bytesCounter++) {
      /*
      convert bytes32 data to uint in order to increase the number enough to
      shift bytes further left while pushing out leftmost bytes
      then convert uint256 data back to bytes32
      then convert to bytes1 where everything but the leftmost hex value (byte)
      is cutoff leaving only the leftmost byte

      TLDR: takes a single character from bytes based on counter
      */
      bytes1 _char = bytes1(
        bytes32(
          uint(_data) * 2 ** (8 * _bytesCounter)
        )
      );
      // add the character if not empty
      if (_char != 0) {
        _bytesString[_stringLength] = _char;
        _stringLength += 1;
      }
    }

    // new bytes with correct matching string length
    bytes memory _bytesStringTrimmed = new bytes(_stringLength);
    // loop through _bytesStringTrimmed throwing in
    // non empty data from _bytesString
    for (_bytesCounter = 0; _bytesCounter < _stringLength; _bytesCounter++) {
      _bytesStringTrimmed[_bytesCounter] = _bytesString[_bytesCounter];
    }
    // return trimmed bytes array converted to string
    return string(_bytesStringTrimmed);
  }

  // takes a dynamically sized array of bytes32. needed for longer strings
  function to64LengthString(
    bytes32[2] _data
  )
    pure
    internal
    returns (string)
  {
    // create new empty bytes array with same length as input
    bytes memory _bytesString = new bytes(_data.length * 32);
    // keep track of string length for later usage in trimming
    uint256 _stringLength;

    // loop through each bytes32 in array
    for (uint _arrayCounter = 0; _arrayCounter < _data.length; _arrayCounter++) {
      // loop through each byte in bytes32
      for (uint _bytesCounter = 0; _bytesCounter < 32; _bytesCounter++) {
        /*
        convert bytes32 data to uint in order to increase the number enough to
        shift bytes further left while pushing out leftmost bytes
        then convert uint256 data back to bytes32
        then convert to bytes1 where everything but the leftmost hex value (byte)
        is cutoff leaving only the leftmost byte

        TLDR: takes a single character from bytes based on counter
        */
        bytes1 _char = bytes1(
          bytes32(
            uint(_data[_arrayCounter]) * 2 ** (8 * _bytesCounter)
          )
        );
        // add the character if not empty
        if (_char != 0) {
          _bytesString[_stringLength] = _char;
          _stringLength += 1;
        }
      }
    }

    // new bytes with correct matching string length
    bytes memory _bytesStringTrimmed = new bytes(_stringLength);
    // loop through _bytesStringTrimmed throwing in
    // non empty data from _bytesString
    for (_bytesCounter = 0; _bytesCounter < _stringLength; _bytesCounter++) {
      _bytesStringTrimmed[_bytesCounter] = _bytesString[_bytesCounter];
    }
    // return trimmed bytes array converted to string
    return string(_bytesStringTrimmed);
  }

  //
  // end common utility functions
  //

  
  //
  // start common non-sequential storage getters/setters
  //

  function stage()
    public
    view
    returns (Stages _stage)
  {
    bytes32 _stageSlot = stageSlot;
    assembly {
      _stage := sload(_stageSlot)
    }
  }

  function setStage(Stages _stage)
    internal
  {
    bytes32 _stageSlot = stageSlot;
    assembly {
      sstore(_stageSlot, _stage)
    }
  }

  function custodian()
    public
    view
    returns (address _custodian)
  {
    bytes32 _custodianSlot = custodianSlot;
    assembly {
      _custodian := sload(_custodianSlot)
    }
  }

  function setCustodian(address _custodian)
    internal
  {
    bytes32 _custodianSlot = custodianSlot;
    assembly {
      sstore(_custodianSlot, _custodian)
    }
  }

  function proofOfCustody32()
    public
    view
    returns (bytes32[2] _proofOfCustody32)
  {
    bytes32 _proofOfCustody32Slot = proofOfCustody32Slot;

    assembly {
      mstore(_proofOfCustody32, sload(_proofOfCustody32Slot))
      mstore(add(_proofOfCustody32, 0x20), sload(add(_proofOfCustody32Slot, 0x01)))
    }
  }

  function setProofOfCustody32(
    bytes32[2] _proofOfCustody32
  )
    internal
  {
    bytes32 _proofOfCustody32Slot = proofOfCustody32Slot;
    assembly {
      // store first slot from memory
      sstore(
        _proofOfCustody32Slot, 
        mload(_proofOfCustody32)
      )
      // store second slot from memory
      sstore(
        add(_proofOfCustody32Slot, 0x01), 
        mload(
          add(_proofOfCustody32, 0x20)
        )
      )
    }
  }

  function totalSupply()
    public
    view
    returns (uint256 _totalSupply)
  {
    bytes32 _totalSupplySlot = totalSupplySlot;
    assembly {
      _totalSupply := sload(_totalSupplySlot)
    }
  }

  function setTotalSupply(uint256 _totalSupply)
    internal
  {
    bytes32 _totalSupplySlot = totalSupplySlot;
    assembly {
      sstore(_totalSupplySlot, _totalSupply)
    }
  }

  function fundedAmountInTokensDuringFiatFunding()
    public
    view
    returns (uint256 _fundedAmountInTokensDuringFiatFunding)
  {
    bytes32 _fundedAmountInTokensDuringFiatFundingSlot = fundedAmountInTokensDuringFiatFundingSlot;
    assembly {
      _fundedAmountInTokensDuringFiatFunding := sload(
        _fundedAmountInTokensDuringFiatFundingSlot
      )
    }
  }

  function setFundedAmountInTokensDuringFiatFunding(
    uint256 _amount
  )
    internal
  {
    bytes32 _fundedAmountInTokensDuringFiatFundingSlot = fundedAmountInTokensDuringFiatFundingSlot;
    assembly {
      sstore(
        _fundedAmountInTokensDuringFiatFundingSlot,
        _amount
      )
    }
  }

  function fiatInvestmentPerUserInTokens(
    address _address
  )
    public
    view
    returns (uint256 _fiatInvested)
  {
    bytes32 _fiatInvestmentPerUserInTokensSlot = fiatInvestmentPerUserInTokensSlot;
    bytes32 _entrySlot = keccak256(
      abi.encodePacked(_address, _fiatInvestmentPerUserInTokensSlot)
    );
    assembly {
      _fiatInvested := sload(_entrySlot)
    }
  }

  function setFiatInvestmentPerUserInTokens(
    address _address, 
    uint256 _fiatInvestment
  )
    internal
  {
    bytes32 _entrySlot = keccak256(
      abi.encodePacked(_address, fiatInvestmentPerUserInTokensSlot)
    );
    assembly {
      sstore(_entrySlot, _fiatInvestment)
    }
  }

  function fundedAmountInWei()
    public
    view
    returns (uint256 _fundedAmountInWei)
  {
    bytes32 _fundedAmountInWeiSlot = fundedAmountInWeiSlot;
    assembly {
      _fundedAmountInWei := sload(_fundedAmountInWeiSlot)
    }
  }

  function setFundedAmountInWei(
    uint256 _fundedAmountInWei
  )
    internal
  {
    bytes32 _fundedAmountInWeiSlot = fundedAmountInWeiSlot;
    assembly {
      sstore(_fundedAmountInWeiSlot, _fundedAmountInWei)
    }
  }

  function investmentAmountPerUserInWei(
    address _address
  )
    public
    view
    returns (uint256 _investmentAmountPerUserInWei)
  {
    bytes32 _entrySlot = keccak256(
      abi.encodePacked(_address, investmentAmountPerUserInWeiSlot)
    );
    assembly {
      _investmentAmountPerUserInWei := sload(_entrySlot)
    }
  }

  function setInvestmentAmountPerUserInWei(
    address _address,
    uint256 _amount
  )
    internal
  {
    bytes32 _entrySlot = keccak256(
      abi.encodePacked(_address, investmentAmountPerUserInWeiSlot)
    );
    assembly {
      sstore(_entrySlot, _amount)
    }
  }

  function unclaimedPayoutTotals(
    address _address
  )
    public
    view
    returns (uint256 _unclaimedPayoutTotals)
  {
    bytes32 _entrySlot = keccak256(
      abi.encodePacked(_address, unclaimedPayoutTotalsSlot)
    );
    assembly {
      _unclaimedPayoutTotals := sload(_entrySlot)
    }
  }

  function setUnclaimedPayoutTotals(
    address _address,
    uint256 _amount
  )
    internal
  {
    bytes32 _entrySlot = keccak256(
      abi.encodePacked(_address, unclaimedPayoutTotalsSlot)
    );
    assembly {
      sstore(_entrySlot, _amount)
    }
  }

  function paused()
    public
    view
    returns (bool _paused)
  {
    bytes32 _pausedSlot = pausedSlot;
    assembly {
      _paused := sload(_pausedSlot)
    }
  }

  function setPaused(
    bool _paused
  )
    internal
  {
    bytes32 _pausedSlot = pausedSlot;
    assembly {
      sstore(_pausedSlot, _paused)
    }
  }

  function tokenInitialized()
    public
    view
    returns (bool _tokenInitialized)
  {
    bytes32 _tokenInitializedSlot = tokenInitializedSlot;
    assembly {
      _tokenInitialized := sload(_tokenInitializedSlot)
    }
  }

  function setTokenInitialized(
    bool _tokenInitialized
  )
    internal
  {
    bytes32 _tokenInitializedSlot = tokenInitializedSlot;
    assembly {
      sstore(_tokenInitializedSlot, _tokenInitialized)
    }
  }

  //
  // end common non-sequential storage getters/setters
  //
}