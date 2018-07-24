/* solium-disable security/no-low-level-calls */

pragma solidity 0.4.24;

import "./PoaProxyCommon.sol";


/**
  @title This contract manages the storage (sequential and non-sequential) of:
  - PoaProxy
  - PoaToken
  - PoaCrowdsale

  @notice For all Poa related contracts, there are two common terms which
  need explanation:
  - sequential storage
    - contract storage that is stored sequentially in order of declaration
    - this is the normal way storage works with smart contracts
  - non-sequential storage
    - contract storage that is stored in a slot non sequentially
    - storage slot is determined by taking a hash of variable's name
    and using that hash as the storage location
    - this pattern is used in order to ensure storage from multiple
    proxied master contracts does not collide
  PoaProxy uses chained "delegatecall()"s to call functions on
  PoaToken and PoaCrowdsale and set the resulting storage
  here on PoaProxy.

  @dev `getContractAddress("Logger").call()` does not use the return value
  because we would rather contract functions to continue even if the event
  did not successfully trigger on the logger contract.
*/
contract PoaProxy is PoaProxyCommon {
  uint8 public constant version = 1;

  event ProxyUpgradedEvent(address upgradedFrom, address upgradedTo);

  /**
    @notice Stores addresses of our contract registry
    as well as the PoaToken and PoaCrowdsale master
    contracts to forward calls to.
  */
  constructor(
    address _poaTokenMaster,
    address _poaCrowdsaleMaster,
    address _registry
  )
    public
  {
    // Ensure that none of the given addresses are empty
    require(_poaTokenMaster != address(0), "_poaTokenMaster must be a valid Ethereum address");
    require(_poaCrowdsaleMaster != address(0), "_poaCrowdsaleMaster must be a valid Ethereum address");
    require(_registry != address(0), "_registry must be a valid Ethereum address");

    // Set addresses in common storage using deterministic storage slots
    setPoaTokenMaster(_poaTokenMaster);
    setPoaCrowdsaleMaster(_poaCrowdsaleMaster);
    setRegistry(_registry);
  }

  /*****************************
   * Start Proxy State Helpers *
   *****************************/

  /**
    @notice Ensures that a given address is a contract by
    making sure it has code. Used during upgrading to make
    sure the new addresses to upgrade to are smart contracts.
   */
  function isContract(address _address)
    private
    view
    returns (bool)
  {
    uint256 _size;
    assembly { _size := extcodesize(_address) }
    return _size > 0;
  }

  /***************************
   * End Proxy State Helpers *
   ***************************/


  /*****************************
   * Start Proxy State Setters *
   *****************************/

  /// @notice Update the stored "poaTokenMaster" address to upgrade the PoaToken master contract
  function proxyChangeTokenMaster(address _newMaster)
    public
    returns (bool)
  {
    require(msg.sender == getContractAddress("PoaManager"), "Only PoaManager is allowed to update the PoaToken contract");
    require(_newMaster != address(0), "_newMaster must be a valid Ethereum address");
    require(poaTokenMaster() != _newMaster, "_newMaster must be different than the current poaTokenMaster");
    require(isContract(_newMaster), "_newMaster must be a smart contract");
    address _oldMaster = poaTokenMaster();
    setPoaTokenMaster(_newMaster);

    emit ProxyUpgradedEvent(_oldMaster, _newMaster);
    getContractAddress("Logger").call(
      bytes4(keccak256("logProxyUpgradedEvent(address,address)")),
      _oldMaster, _newMaster
    );

    return true;
  }

  /// @notice Update the stored `poaCrowdsaleMaster` address to upgrade the PoaCrowdsale master contract
  function proxyChangeCrowdsaleMaster(address _newMaster)
    public
    returns (bool)
  {
    require(msg.sender == getContractAddress("PoaManager"), "Only PoaManager is allowed to update the PoaToken contract");
    require(_newMaster != address(0), "_newMaster must be a valid Ethereum address");
    require(poaCrowdsaleMaster() != _newMaster, "_newMaster must be different than the current poaTokenMaster");
    require(isContract(_newMaster), "_newMaster must be a smart contract");
    address _oldMaster = poaCrowdsaleMaster();
    setPoaCrowdsaleMaster(_newMaster);

    emit ProxyUpgradedEvent(_oldMaster, _newMaster);
    getContractAddress("Logger").call(
      bytes4(keccak256("logProxyUpgradedEvent(address,address)")),
      _oldMaster, _newMaster
    );

    return true;
  }

  /***************************
   * End Proxy State Setters *
   ***************************/

  /**
    @notice Fallback function for all proxied functions using "delegatecall()".
    It will first forward all functions to the "poaTokenMaster" address. If the
    called function isn't found there, then "poaTokenMaster"'s fallback function
    will forward the call to "poaCrowdsale". If the called function also isn't
    found there, it will fail at last.
  */
  function()
    external
    payable
  {
    bytes32 _poaTokenMasterSlot = poaTokenMasterSlot;
    assembly {
      // Load PoaToken master address from first storage pointer
      let _poaTokenMaster := sload(_poaTokenMasterSlot)

      // calldatacopy(t, f, s)
      calldatacopy(
        0x0, // t = mem position to
        0x0, // f = mem position from
        calldatasize // s = size bytes
      )

      // delegatecall(g, a, in, insize, out, outsize) => returns "0" on error, or "1" on success
      let result := delegatecall(
        gas, // g = gas
        _poaTokenMaster, // a = address
        0x0, // in = mem in  mem[in..(in+insize)
        calldatasize, // insize = mem insize  mem[in..(in+insize)
        0x0, // out = mem out  mem[out..(out+outsize)
        0 // outsize = mem outsize  mem[out..(out+outsize)
      )

      // returndatacopy(t, f, s)
      returndatacopy(
        0x0, // t = mem position to
        0x0,  // f = mem position from
        returndatasize // s = size bytes
      )

      // Check if the call was successful
      if iszero(result) {
        // Revert if call failed
        revert(0, 0)
      }
        // Return if call succeeded
        return(
          0x0,
          returndatasize
        )
    }
  }
}
