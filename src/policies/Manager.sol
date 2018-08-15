pragma solidity ^0.4.21;

import "./Policy.sol";
import "./PolicySet.sol";

contract PolicyManager is PolicySet {
    PolicySet[] sets;

    function registerPolicySet(address ofPolicySet) {
        sets.push(PolicySet(ofPolicySet));
    }

    modifier isValidPolicyBySig(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) {
        preValidate(sig, addresses, values, identifier);
        _;
        postValidate(sig, addresses, values, identifier);
    }

    modifier isValidPolicy(address[5] addresses, uint[3] values, bytes32 identifier) {
        preValidate(msg.sig, addresses, values, identifier);
        _;
        postValidate(msg.sig, addresses, values, identifier);
    }

    function preValidate(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view public {
        validate(sig, policies[sig].pre, addresses, values, identifier);
        
        for(uint i = 0; i < sets.length; ++i) {
            sets[i].preValidate(sig, addresses, values, identifier);
        }
    }

    function postValidate(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view public {
        validate(sig, policies[sig].post, addresses, values, identifier);

        for(uint i = 0; i < sets.length; ++i) {
            sets[i].postValidate(sig, addresses, values, identifier);
        }
    }
}
