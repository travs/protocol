pragma solidity ^0.4.21;

import "./Policy.sol";

contract PolicySet {
    struct Entry {
        Policy[] pre;
        Policy[] post;
    }

    mapping(bytes4 => Entry) policies;

    function register(bytes4 sign, address ofPolicy) public {
        uint position = Policy(ofPolicy).position();
        if (position == 0) {
            // Pre condition
            policies[sign].pre.push(Policy(ofPolicy));
        } else if (position == 1) {
            // Post condition
            policies[sign].post.push(Policy(ofPolicy));
        } else {
            revert();    // Only 0 or 1 allowed
        }
    }

    function PoliciesToAddresses(Policy[] storage _policies) internal view returns (address[]) {
        address[] memory res = new address[](_policies.length);
        for(uint i = 0; i < _policies.length; ++i) {
            res[i] = address(_policies[i]);
        }
        return res;
    }

    function getPoliciesBySig(bytes4 sig) public view returns (address[], address[]) {
        return (PoliciesToAddresses(policies[sig].pre), PoliciesToAddresses(policies[sig].post));
    }
    
    function preValidate(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view public {
        validate(sig, policies[sig].pre, addresses, values, identifier);
    }

    function postValidate(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) view public {
        validate(sig, policies[sig].post, addresses, values, identifier);
    }

    function validate(bytes4 sig, Policy[] storage aux, address[5] addresses, uint[3] values, bytes32 identifier) view internal {
        for(uint i = 0; i < aux.length; ++i) {
            if (aux[i].rule(sig, addresses, values, identifier) == false) {
                revert();
            }
        }
    }
}
