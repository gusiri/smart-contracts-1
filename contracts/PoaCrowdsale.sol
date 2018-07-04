pragma solidity 0.4.23;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./PoaBase.sol";

/* solium-disable security/no-block-members */
/* solium-disable security/no-low-level-calls */


contract PoaCrowdsale is PoaBase {
  using SafeMath for uint256;

  uint256 public constant crowdsaleVersion = 1;
  // ‰ permille NOT percent: fee paid to BBK holders through ACT
  uint256 public constant feeRate = 5;

  // Number of digits includud during the percent calculation
  uint256 public constant precisionOfPercentCalc = 12;

  //
  // start special hashed PoaCrowdsale pointers
  //

  bytes32 private constant crowdsaleInitializedSlot = keccak256("crowdsaleInitialized");
  bytes32 private constant startTimeSlot = keccak256("startTime");
  bytes32 private constant fundingTimeoutSlot = keccak256("fundingTimeout");
  bytes32 private constant activationTimeoutSlot = keccak256("activationTimeout");
  bytes32 private constant fiatCurrency32Slot = keccak256("fiatCurrency32");
  bytes32 private constant fundingGoalInCentsSlot = keccak256("fundingGoalInCents");
  bytes32 private constant fundedAmountInCentsDuringFiatFundingSlot
  = keccak256("fundedAmountInCentsDuringFiatFunding");
  bytes32 private constant brokerSlot = keccak256("broker");

  //
  // end special hashed PoaCrowdsale pointers
  //

  event Unpause();

  //
  // start modifiers
  //

  modifier checkTimeout() {
    uint256 fundingTimeoutDeadline = startTime().add(fundingTimeout());
    uint256 activationTimeoutDeadline = startTime()
      .add(fundingTimeout())
      .add(activationTimeout());

    if (
      (uint256(stage()) < 3 && block.timestamp >= fundingTimeoutDeadline) ||
      (stage() == Stages.Pending && block.timestamp >= activationTimeoutDeadline)
    ) {
      enterStage(Stages.Failed);
    }
    
    _;
  }

  modifier isBuyWhitelisted() {
    require(checkIsWhitelisted(msg.sender));
    _;
  }

  //
  // end modifiers
  //

  function initializeCrowdsale(
    bytes32 _fiatCurrency32, // bytes32 of fiat currency string
    address _broker,
    uint256 _startTime, // unix timestamp
    uint256 _fundingTimeout, // seconds after startTime
    uint256 _activationTimeout, // seconds after startTime + fundingTimeout
    uint256 _fundingGoalInCents // fiat cents
  )
    external
    returns (bool)
  {
    // ensure that token has already been initialized
    require(tokenInitialized());
    // ensure that crowdsale has not already been initialized
    require(!crowdsaleInitialized());

    // validate initialize parameters
    require(_fiatCurrency32 != bytes32(0));
    require(_broker != address(0));
    require(_startTime > block.timestamp);
    require(_fundingTimeout >= 60 * 60 * 24);
    require(_activationTimeout >= 60 * 60 * 24 * 7);
    require(_fundingGoalInCents > 0);
    require(totalSupply() > _fundingGoalInCents);

    // initialize storage
    setFiatCurrency32(_fiatCurrency32);
    setBroker(_broker);
    setStartTime(_startTime);
    setFundingTimeout(_fundingTimeout);
    setActivationTimeout(_activationTimeout);
    setFundingGoalInCents(_fundingGoalInCents);

    // run getRate once in order to see if rate is initialized, throws if not
    require(getFiatRate() > 0);
    setCrowdsaleInitialized(true);

    return true;
  }

  //
  // start lifecycle functions
  //

  // used to enter a new stage of the contract
  function enterStage(Stages _stage)
    internal
  {
    setStage(_stage);
    getContractAddress("Logger").call(
      bytes4(keccak256("logStageEvent(uint256)")),
      _stage
    );
  }

  // used to start the FIAT preSale funding
  function startFiatPreSale()
    external
    atStage(Stages.PreFunding)
    returns (bool)
  {
    enterStage(Stages.FiatFunding);
    return true;
  }

  // used to start the sale as long as startTime has passed
  function startEthSale()
    external
    atEitherStage(Stages.PreFunding, Stages.FiatFunding)
    returns (bool)
  {
    require(block.timestamp >= startTime());
    enterStage(Stages.EthFunding);
    return true;
  }

  // Buy with FIAT
  function buyFiat
  (
    address _contributor, 
    uint256 _amountInCents
  )
    external
    atStage(Stages.FiatFunding)
    onlyCustodian
    returns (bool)
  {
    // Do not allow funding less then 100 cents
    require(_amountInCents >= 100);

    //if the amount is bigger than funding goal, reject the transaction
    if (fundedAmountInCentsDuringFiatFunding() >= fundingGoalInCents()) {
      return false;
    } else {
      uint256 _newFundedAmount = fundedAmountInCentsDuringFiatFunding().add(_amountInCents);

      if (fundingGoalInCents().sub(_newFundedAmount) > 0) {
        setFundedAmountInCentsDuringFiatFunding(
          fundedAmountInCentsDuringFiatFunding().add(_amountInCents)
        );

        //_percentOfFundingGoal multipled by precisionOfPercentCalc to get a more accurate result
        uint256 _percentOfFundingGoal = percent(_amountInCents, fundingGoalInCents(), precisionOfPercentCalc);
        uint256 _tokenAmount = totalSupply().mul(_percentOfFundingGoal).div(10 ** (precisionOfPercentCalc - 1));

        setFundedAmountInTokensDuringFiatFunding(
          fundedAmountInTokensDuringFiatFunding().add(_tokenAmount)
        );
        setFiatInvestmentPerUserInTokens(
          _contributor, 
          fiatInvestmentPerUserInTokens(_contributor).add(_tokenAmount)
        );

        return true;
      } else {
        return false;
      } 

    }
  }

  // buy tokens
  function buy()
    external
    payable
    checkTimeout
    atStage(Stages.EthFunding)
    isBuyWhitelisted
    returns (bool)
  {
    // Prevent FiatFunding addresses from contributing to funding to keep total supply legit
    if (isFiatInvestor(msg.sender)) {
      return false;
    }

    // prevent case where buying after reaching fundingGoal results in buyer
    // earning money on a buy
    if (weiToFiatCents(fundedAmountInWei()) > fundingGoalInCents()) {
      enterStage(Stages.Pending);
      if (msg.value > 0) {
        msg.sender.transfer(msg.value);
      }
      return false;
    }

    // get current funded amount + sent value in cents
    // with most current rate available
    uint256 _currentFundedCents = weiToFiatCents(fundedAmountInWei().add(msg.value))
      .add(fundedAmountInCentsDuringFiatFunding());
    // check if balance has met funding goal to move on to Pending
    if (_currentFundedCents < fundingGoalInCents()) {
      // give a range due to fun fun integer division
      if (fundingGoalInCents().sub(_currentFundedCents) > 1) {
        // continue sale if more than 1 cent from goal in fiat
        return buyAndContinueFunding(msg.value);
      } else {
        // finish sale if within 1 cent of goal in fiat
        // no refunds for overpayment should be given
        return buyAndEndFunding(false);
      }
    } else {
      // finish sale, we are now over the funding goal
      // a refund for overpaid amount should be given
      return buyAndEndFunding(true);
    }
  }

  // buy and continue funding process (when funding goal not met)
  function buyAndContinueFunding(uint256 _payAmount)
    internal
    returns (bool)
  {
    // save this for later in case needing to reclaim
    setInvestmentAmountPerUserInWei(
      msg.sender, 
      investmentAmountPerUserInWei(msg.sender).add(_payAmount)
    );
    // increment the funded amount
    setFundedAmountInWei(fundedAmountInWei().add(_payAmount));

    getContractAddress("Logger").call(
      bytes4(keccak256("logBuyEvent(address,uint256)")), msg.sender, _payAmount
    );

    return true;
  }

  // buy and finish funding process (when funding goal met)
  function buyAndEndFunding(bool _shouldRefund)
    internal
    returns (bool)
  {
    // let the world know that the token is in Pending Stage
    enterStage(Stages.Pending);
    uint256 _refundAmount = _shouldRefund ?
      fundedAmountInWei().add(msg.value).sub(fiatCentsToWei(fundingGoalInCents())) :
      0;
    // transfer refund amount back to user
    msg.sender.transfer(_refundAmount);
    // actual Ξ amount to buy after refund
    uint256 _payAmount = msg.value.sub(_refundAmount);
    buyAndContinueFunding(_payAmount);

    return true;
  }

  // activate token with proofOfCustody fee is taken from contract balance
  // brokers must work this into their funding goals
  function activate
  (
    bytes32[2] _ipfsHash
  )
    external
    checkTimeout
    onlyCustodian
    atStage(Stages.Pending)
    validIpfsHash(_ipfsHash)
    returns (bool)
  {
    // calculate company fee charged for activation
    uint256 _fee = calculateFee(address(this).balance);
    // if activated and fee paid: put in Active stage
    enterStage(Stages.Active);
    // fee sent to FeeManager where fee gets
    // turned into ACT for lockedBBK holders
    payFee(_fee);
    setProofOfCustody32(_ipfsHash);
    getContractAddress("Logger")
      .call(bytes4(keccak256("logProofOfCustodyUpdatedEvent()")));
    // balance of contract (fundingGoalInCents) set to claimable by broker.
    // can now be claimed by broker via claim function
    // should only be buy()s - fee. this ensures buy() dust is cleared
    setUnclaimedPayoutTotals(
      broker(), 
      unclaimedPayoutTotals(broker()).add(address(this).balance)
    );
    // allow trading of tokens
    setPaused(false);
    // let world know that this token can now be traded.
    emit Unpause();

    return true;
  }

  // used to manually set Stage to Failed when no users have bought any tokens
  // if no buy()s occurred before fundingTimeoutBlock token would be stuck in Funding
  // can also be used when activate is not called by custodian within activationTimeout
  // lastly can also be used when no one else has called reclaim.
  function setFailed()
    external
    atEitherStage(Stages.EthFunding, Stages.Pending)
    checkTimeout
    returns (bool)
  {
    if (stage() != Stages.Failed) {
      revert();
    }
    return true;
  }

  // reclaim Ξ for sender if fundingGoalInCents is not met within fundingTimeoutBlock
  function reclaim()
    external
    checkTimeout
    atStage(Stages.Failed)
    returns (bool)
  {
    require(!isFiatInvestor(msg.sender));
    setTotalSupply(0);
    uint256 _refundAmount = investmentAmountPerUserInWei(msg.sender);
    setInvestmentAmountPerUserInWei(msg.sender, 0);
    require(_refundAmount > 0);
    setFundedAmountInWei(fundedAmountInWei().sub(_refundAmount));
    msg.sender.transfer(_refundAmount);
    getContractAddress("Logger").call(
      bytes4(keccak256("logReclaimEvent(address,uint256)")),
      msg.sender,
      _refundAmount
    );
    return true;
  }

  function setCancelled()
    external
    onlyCustodian
    atEitherStage(Stages.PreFunding, Stages.FiatFunding)
    returns (bool)
  {
    enterStage(Stages.Cancelled);
    
    return true;
  }

  //
  // end lifecycle functions
  //

  //
  // start utility functions
  //

  function percent(
    uint256 numerator,
    uint256 denominator,
    uint256 precision
  )
    public
    pure
    returns(uint256 quotient)
  {

    // caution, check safe-to-multiply here
    uint256 _numerator = numerator.mul(10 ** (precision+1));
    // with rounding of last digit
    uint256 _quotient = _numerator.div(denominator).add(5).div(10);
    return ( _quotient);
  }

  // gas saving call to get fiat rate without interface
  function getFiatRate()
    public
    view
    returns (uint256 _fiatRate)
  {
    bytes4 _sig = bytes4(keccak256("getRate32(bytes32)"));
    address _exchangeRates = getContractAddress("ExchangeRates");
    bytes32 _fiatCurrency = keccak256(fiatCurrency());

    assembly {
      let _call := mload(0x40) // set _call to free memory pointer
      mstore(_call, _sig) // store _sig at _call pointer
      mstore(add(_call, 0x04), _fiatCurrency) // store _fiatCurrency at _call offset by 4 bytes for pre-existing _sig

      // staticcall(g, a, in, insize, out, outsize) => 0 on error 1 on success
      let success := staticcall(
        gas,             // g = gas: whatever was passed already
        _exchangeRates,  // a = address: address from getContractAddress
        _call,           // in = mem in  mem[in..(in+insize): set to free memory pointer
        0x24,            // insize = mem insize  mem[in..(in+insize): size of sig (bytes4) + bytes32 = 0x24
        _call,           // out = mem out  mem[out..(out+outsize): output assigned to this storage address
        0x20             // outsize = mem outsize  mem[out..(out+outsize): output should be 32byte slot (uint256 size = 0x20 = slot size 0x20)
      )

      // revert if not successful
      if iszero(success) {
        revert(0, 0)
      }

      _fiatRate := mload(_call) // assign result to return value
      mstore(0x40, add(_call, 0x24)) // advance free memory pointer by largest _call size
    }
  }

  // returns fiat value in cents of given wei amount
  function weiToFiatCents(uint256 _wei)
    public
    view
    returns (uint256)
  {
    // get eth to fiat rate in cents from ExchangeRates
    return _wei.mul(getFiatRate()).div(1e18);
  }

  // returns wei value from fiat cents
  function fiatCentsToWei(uint256 _cents)
    public
    view
    returns (uint256)
  {
    return _cents.mul(1e18).div(getFiatRate());
  }

  // get funded amount in cents
  function fundedAmountInCents()
    external
    view
    returns (uint256)
  {
    return weiToFiatCents(fundedAmountInWei());
  }

  // get fundingGoal in wei
  function fundingGoalInWei()
    external
    view
    returns (uint256)
  {
    return fiatCentsToWei(fundingGoalInCents());
  }

  // pay fee to FeeManager
  function payFee(uint256 _value)
    internal
    returns (bool)
  {
    require(
      // solium-disable-next-line security/no-call-value
      getContractAddress("FeeManager")
        .call.value(_value)(bytes4(keccak256("payFee()")))
    );
  }

  // public utility function to allow checking of required fee for a given amount
  function calculateFee(uint256 _value)
    public
    pure
    returns (uint256)
  {
    // divide by 1000 because feeRate permille
    return feeRate.mul(_value).div(1000);
  }

  function isFiatInvestor(
    address _buyer
  )
    internal
    view
    returns(bool)
  {
    return fiatInvestmentPerUserInTokens(_buyer) != 0;
  }

  //
  // end utility functions
  //

  //
  // start regular getters
  //

  function fiatCurrency()
    public
    view
    returns (string)
  {
    return to32LengthString(fiatCurrency32());
  }

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
  // start hashed pointer getters
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

  // mimics mapping storage method of storing/getting entries

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

  function crowdsaleInitialized()
    public
    view
    returns (bool _crowdsaleInitialized)
  {
    bytes32 _crowdsaleInitializedSlot = crowdsaleInitializedSlot;
    assembly {
      _crowdsaleInitialized := sload(_crowdsaleInitializedSlot)
    }
  }

  function startTime()
    public
    view
    returns (uint256 _startTime)
  {
    bytes32 _startTimeSlot = startTimeSlot;
    assembly {
      _startTime := sload(_startTimeSlot)
    }
  }

  function fundingTimeout()
    public
    view
    returns (uint256 _fundingTimeout)
  {
    bytes32 _fundingTimeoutSlot = fundingTimeoutSlot;
    assembly {
      _fundingTimeout := sload(_fundingTimeoutSlot)
    }
  }

  function activationTimeout()
    public
    view
    returns (uint256 _activationTimeout)
  {
    bytes32 _activationTimeoutSlot = activationTimeoutSlot;
    assembly {
      _activationTimeout := sload(_activationTimeoutSlot)
    }
  }

  function fiatCurrency32()
    internal
    view
    returns (bytes32 _fiatCurrency32)
  {
    bytes32 _fiatCurrency32Slot = fiatCurrency32Slot;
    assembly {
      _fiatCurrency32 := sload(_fiatCurrency32Slot)
    }
  }

  function fundingGoalInCents()
    public
    view
    returns (uint256 _fundingGoalInCents)
  {
    bytes32 _fundingGoalInCentsSlot = fundingGoalInCentsSlot;
    assembly {
      _fundingGoalInCents := sload(_fundingGoalInCentsSlot)
    }
  }

  function fundedAmountInCentsDuringFiatFunding()
    public
    view
    returns (uint256 _fundedAmountInCentsDuringFiatFunding)
  {
    bytes32 _fundedAmountInCentsDuringFiatFundingSlot = fundedAmountInCentsDuringFiatFundingSlot;
    assembly {
      _fundedAmountInCentsDuringFiatFunding := sload(_fundedAmountInCentsDuringFiatFundingSlot)
    }
  }

  function broker()
    public
    view
    returns (address _broker)
  {
    bytes32 _brokerSlot = brokerSlot;
    assembly {
      _broker := sload(_brokerSlot)
    }
  }

  //
  // end  hashed pointer getters
  //

  //
  // start hashed pointer setters
  //

  function setStage(
    Stages _stage
  )
    internal
  {
    bytes32 _stageSlot = stageSlot;
    assembly {
      sstore(_stageSlot, _stage)
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

  // mimics mapping storage method of storing/getting entries
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

  function setCrowdsaleInitialized(
    bool _crowdsaleInitialized
  )
    internal
  {
    bytes32 _crowdsaleInitializedSlot = crowdsaleInitializedSlot;
    assembly {
      sstore(_crowdsaleInitializedSlot, _crowdsaleInitialized)
    }
  }

  function setStartTime(
    uint256 _startTime
  )
    internal
  {
    bytes32 _startTimeSlot = startTimeSlot;
    assembly {
      sstore(_startTimeSlot, _startTime)
    }
  }

  function setFundingTimeout(
    uint256 _fundingTimeout
  )
    internal
  {
    bytes32 _fundingTimeoutSlot = fundingTimeoutSlot;
    assembly {
      sstore(_fundingTimeoutSlot, _fundingTimeout)
    }
  }

  function setActivationTimeout(
    uint256 _activationTimeout
  )
    internal
  {
    bytes32 _activationTimeoutSlot = activationTimeoutSlot;
    assembly {
      sstore(_activationTimeoutSlot, _activationTimeout)
    }
  }

  function setFiatCurrency32(
    bytes32 _fiatCurrency32
  )
    internal
  {
    bytes32 _fiatCurrency32Slot = fiatCurrency32Slot;
    assembly {
      sstore(_fiatCurrency32Slot, _fiatCurrency32)
    }
  }

  function setFundingGoalInCents(
    uint256 _fundingGoalInCents
  )
    internal
  {
    bytes32 _fundingGoalInCentsSlot = fundingGoalInCentsSlot;
    assembly {
      sstore(_fundingGoalInCentsSlot, _fundingGoalInCents)
    }
  }

  function setFundedAmountInCentsDuringFiatFunding(
    uint256 _fundedAmountInCentsDuringFiatFunding
  )
    internal
  {
    bytes32 _fundedAmountInCentsDuringFiatFundingSlot = fundedAmountInCentsDuringFiatFundingSlot;
    assembly {
      sstore(_fundedAmountInCentsDuringFiatFundingSlot, _fundedAmountInCentsDuringFiatFunding)
    }
  }

  function setBroker(
    address _broker
  )
    internal
  {
    bytes32 _brokerSlot = brokerSlot;
    assembly {
      sstore(_brokerSlot, _broker)
    }
  }

  //
  // end hashed pointer setters
  //

}