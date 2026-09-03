// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * Slots Booking Escrow Smart Contract
 * Manages on-chain hold deposits and automated release upon vehicle exit
 * Deployed on Polygon Amoy Testnet
 */
contract SlotsBookingEscrow {
    address public owner;
    address public parkingOperator;
    
    mapping(bytes32 => EscrowHold) public holds;
    mapping(address => uint256) public operatorBalance;
    
    struct EscrowHold {
        address customer;
        uint256 amount;
        uint256 createdAt;
        bool isActive;
        bool entryConfirmed;
        bool paymentReleased;
    }
    
    event HoldDeposited(bytes32 indexed bookingId, address indexed customer, uint256 amount);
    event EntryConfirmed(bytes32 indexed bookingId);
    event PaymentReleased(bytes32 indexed bookingId, uint256 amount);
    event OverchargeRefunded(bytes32 indexed bookingId, uint256 refundAmount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier onlyOperator() {
        require(msg.sender == parkingOperator, "Only operator");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        parkingOperator = msg.sender;
    }
    
    /**
     * Deposit hold for booking
     * @param bookingId Unique booking identifier
     */
    function depositHold(bytes32 bookingId) external payable {
        require(msg.value > 0, "Amount must be greater than 0");
        require(!holds[bookingId].isActive, "Hold already exists");
        
        holds[bookingId] = EscrowHold({
            customer: msg.sender,
            amount: msg.value,
            createdAt: block.timestamp,
            isActive: true,
            entryConfirmed: false,
            paymentReleased: false
        });
        
        operatorBalance[parkingOperator] += msg.value;
        
        emit HoldDeposited(bookingId, msg.sender, msg.value);
    }
    
    /**
     * Confirm vehicle entry
     * @param bookingId Unique booking identifier
     */
    function confirmEntry(bytes32 bookingId) external onlyOperator {
        require(holds[bookingId].isActive, "Hold not found");
        require(!holds[bookingId].entryConfirmed, "Entry already confirmed");
        
        holds[bookingId].entryConfirmed = true;
        
        emit EntryConfirmed(bookingId);
    }
    
    /**
     * Release payment to operator upon exit
     * @param bookingId Unique booking identifier
     */
    function releasePayment(bytes32 bookingId) external onlyOperator {
        EscrowHold storage hold = holds[bookingId];
        
        require(hold.isActive, "Hold not found");
        require(hold.entryConfirmed, "Entry not confirmed");
        require(!hold.paymentReleased, "Payment already released");
        
        uint256 amount = hold.amount;
        hold.paymentReleased = true;
        hold.isActive = false;
        
        operatorBalance[parkingOperator] -= amount;
        payable(parkingOperator).transfer(amount);
        
        emit PaymentReleased(bookingId, amount);
    }
    
    /**
     * Refund overcharge to customer
     * @param bookingId Unique booking identifier
     * @param refundAmount Amount to refund
     */
    function refundOvercharge(bytes32 bookingId, uint256 refundAmount) external onlyOperator {
        EscrowHold storage hold = holds[bookingId];
        
        require(hold.isActive, "Hold not found");
        require(refundAmount <= hold.amount, "Refund exceeds hold amount");
        
        hold.amount -= refundAmount;
        operatorBalance[parkingOperator] -= refundAmount;
        
        payable(hold.customer).transfer(refundAmount);
        
        emit OverchargeRefunded(bookingId, refundAmount);
    }
    
    /**
     * Cancel hold and refund customer
     * @param bookingId Unique booking identifier
     */
    function cancelHold(bytes32 bookingId) external {
        EscrowHold storage hold = holds[bookingId];
        
        require(hold.isActive, "Hold not found");
        require(
            msg.sender == hold.customer || msg.sender == owner,
            "Not authorized"
        );
        require(!hold.entryConfirmed, "Entry already confirmed");
        
        uint256 amount = hold.amount;
        hold.isActive = false;
        operatorBalance[parkingOperator] -= amount;
        
        payable(hold.customer).transfer(amount);
    }
    
    /**
     * Update parking operator address
     * @param newOperator New operator address
     */
    function setOperator(address newOperator) external onlyOwner {
        parkingOperator = newOperator;
    }
    
    /**
     * Withdraw operator balance
     */
    function withdrawOperatorBalance() external onlyOperator {
        uint256 balance = operatorBalance[parkingOperator];
        require(balance > 0, "No balance to withdraw");
        
        operatorBalance[parkingOperator] = 0;
        payable(parkingOperator).transfer(balance);
    }
    
    /**
     * Get hold details
     * @param bookingId Unique booking identifier
     */
    function getHold(bytes32 bookingId) external view returns (
        address customer,
        uint256 amount,
        uint256 createdAt,
        bool isActive,
        bool entryConfirmed,
        bool paymentReleased
    ) {
        EscrowHold storage hold = holds[bookingId];
        return (
            hold.customer,
            hold.amount,
            hold.createdAt,
            hold.isActive,
            hold.entryConfirmed,
            hold.paymentReleased
        );
    }
}