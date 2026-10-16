// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev ERC-20 that silently takes a 1% fee on every transfer / transferFrom.
///      Used to verify PactFlow rejects fee-on-transfer tokens.
contract FeeToken {
    string public name = "Fee Token";
    string public symbol = "FEE";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @dev 1% fee burned on every transfer. Recipient gets 99% of `amount`.
    function transfer(address to, uint256 amount) external returns (bool) {
        _transferWithFee(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transferWithFee(from, to, amount);
        return true;
    }

    function _transferWithFee(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "insufficient balance");
        uint256 fee = amount / 100; // 1% fee taken, not transferred to `to`
        uint256 received = amount - fee;
        balanceOf[from] -= amount;
        totalSupply -= fee; // burn the fee
        balanceOf[to] += received;
        emit Transfer(from, to, received);
    }
}
