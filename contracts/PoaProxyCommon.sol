pragma solidity 0.4.23;


contract PoaProxyCommon {
  //
  // start proxy common non-sequential storage pointers
  //

  bytes32 public constant poaTokenMasterSlot = keccak256("PoaTokenMaster");
  bytes32 public constant poaCrowdsaleMasterSlot = keccak256("PoaCrowdsaleMaster");
  bytes32 public constant registrySlot = keccak256("registry");

  //
  // end proxy common non-sequential storage pointers
  //

  //
  // start proxy common non-sequential storage getters/setters
  //

  function poaTokenMaster()
    public
    view
    returns (address _poaTokenMaster)
  {
    bytes32 _poaTokenMasterSlot = poaTokenMasterSlot;
    assembly {
      _poaTokenMaster := sload(_poaTokenMasterSlot)
    }
  }

  function setPoaTokenMaster(
    address _poaTokenMaster
  )
    internal
  {
    bytes32 _poaTokenMasterSlot = poaTokenMasterSlot;
    assembly {
      sstore(_poaTokenMasterSlot, _poaTokenMaster)
    }
  }

  function poaCrowdsaleMaster()
    public
    view
    returns (address _poaCrowdsaleMaster)
  {
    bytes32 _poaCrowdsaleMasterSlot = poaCrowdsaleMasterSlot;
    assembly {
      _poaCrowdsaleMaster := sload(_poaCrowdsaleMasterSlot)
    }
  }

  function setPoaCrowdsaleMaster(
    address _poaCrowdsaleMaster
  )
    internal
  {
    bytes32 _poaCrowdsaleMasterSlot = poaCrowdsaleMasterSlot;
    assembly {
      sstore(_poaCrowdsaleMasterSlot, _poaCrowdsaleMaster)
    }
  }

  function registry()
    public
    view
    returns (address _registry)
  {
    bytes32 _registrySlot = registrySlot;
    assembly {
      _registry := sload(_registrySlot)
    }
  }

  function setRegistry(
    address _registry
  )
    internal
  {
    bytes32 _registrySlot = registrySlot;
    assembly {
      sstore(_registrySlot, _registry)
    }
  }

  //
  // start proxy common non-sequential storage getters/setters
  //

}