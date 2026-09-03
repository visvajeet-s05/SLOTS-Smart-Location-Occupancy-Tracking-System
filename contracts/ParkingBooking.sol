// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * Parking Booking Smart Contract
 * Immutable booking receipts on Polygon EVM
 * Handles multi-token/MATIC escrow deposits and verifiable slot hashes
 */

contract ParkingBooking {
    address public owner;
    uint256 public bookingCounter;
    uint256 public hourlyRate; // In MATIC (or wei)
    
    // Edge device and operator wallets authorized for check-in verification
    mapping(address => bool) public authorizedDevices;
    mapping(address => bool) public authorizedOperators;
    
    // Booking receipts
    mapping(uint256 => BookingReceipt) public bookings;
    
    // User to booking IDs mapping
    mapping(address => uint256[]) public userBookings;
    
    // Slot to active booking mapping
    mapping(string => uint256) public slotBookings;
    
    // Events
    event BookingCreated(
        uint256 indexed bookingId,
        address indexed user,
        string slotId,
        uint256 amount,
        uint256 startTime,
        uint256 endTime
    );
    
    event CheckInConfirmed(
        uint256 indexed bookingId,
        string verificationHash,
        uint256 timestamp
    );
    
    event BookingRefunded(
        uint256 indexed bookingId,
        address indexed user,
        uint256 refundAmount,
        uint256 timestamp
    );
    
    event HourlyRateUpdated(uint256 oldRate, uint256 newRate);
    
    event DeviceAuthorized(address indexed device, bool authorized);
    event OperatorAuthorized(address indexed operator, bool authorized);
    
    struct BookingReceipt {
        uint256 bookingId;
        string slotId;
        address userAddress;
        uint256 amountPaid;
        uint256 startTime;
        uint256 endTime;
        bool verified;
        bool refunded;
        uint256 createdAt;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    modifier onlyAuthorized() {
        require(
            authorizedDevices[msg.sender] || authorizedOperators[msg.sender],
            "Not authorized"
        );
        _;
    }
    
    constructor(uint256 _hourlyRate) {
        owner = msg.sender;
        hourlyRate = _hourlyRate;
        bookingCounter = 0;
    }
    
    /**
     * Create a new booking with MATIC payment
     * @param slotId The parking slot identifier
     * @param startTime Unix timestamp for booking start
     * @param endTime Unix timestamp for booking end
     */
    function createBooking(
        string memory slotId,
        uint256 startTime,
        uint256 endTime
    ) public payable {
        require(msg.value > 0, "Payment required");
        require(startTime < endTime, "Invalid time range");
        require(startTime > block.timestamp, "Start time must be in future");
        
        // Calculate required payment based on duration
        uint256 duration = endTime - startTime;
        uint256 durationHours = duration / 3600; // Convert seconds to hours
        require(durationHours > 0, "Minimum duration is 1 hour");
        
        uint256 requiredPayment = hourlyRate * durationHours;
        require(msg.value >= requiredPayment, "Insufficient payment");
        
        // Check if slot is already booked for this time range
        require(slotBookings[slotId] == 0, "Slot already booked");
        
        // Create booking
        bookingCounter++;
        uint256 bookingId = bookingCounter;
        
        bookings[bookingId] = BookingReceipt({
            bookingId: bookingId,
            slotId: slotId,
            userAddress: msg.sender,
            amountPaid: msg.value,
            startTime: startTime,
            endTime: endTime,
            verified: false,
            refunded: false,
            createdAt: block.timestamp
        });
        
        // Update mappings
        userBookings[msg.sender].push(bookingId);
        slotBookings[slotId] = bookingId;
        
        // Refund excess payment if any
        if (msg.value > requiredPayment) {
            uint256 excess = msg.value - requiredPayment;
            payable(msg.sender).transfer(excess);
        }
        
        emit BookingCreated(
            bookingId,
            msg.sender,
            slotId,
            msg.value,
            startTime,
            endTime
        );
    }
    
    /**
     * Confirm check-in with verification hash
     * Only callable by authorized edge devices or operators
     * @param bookingId The booking ID to verify
     * @param verificationHash Cryptographic hash of verification data
     */
    function confirmCheckIn(
        uint256 bookingId,
        string memory verificationHash
    ) public onlyAuthorized {
        BookingReceipt storage booking = bookings[bookingId];
        
        require(booking.bookingId != 0, "Booking does not exist");
        require(!booking.verified, "Already verified");
        require(!booking.refunded, "Booking was refunded");
        require(
            block.timestamp >= booking.startTime,
            "Booking not yet started"
        );
        require(
            block.timestamp <= booking.endTime,
            "Booking has expired"
        );
        
        // Mark as verified
        booking.verified = true;
        
        emit CheckInConfirmed(bookingId, verificationHash, block.timestamp);
    }
    
    /**
     * Refund booking (user cancellation)
     * Only allowed before start time
     * @param bookingId The booking ID to refund
     */
    function refundBooking(uint256 bookingId) public {
        BookingReceipt storage booking = bookings[bookingId];
        
        require(booking.bookingId != 0, "Booking does not exist");
        require(
            msg.sender == booking.userAddress,
            "Only booking owner can refund"
        );
        require(!booking.verified, "Already verified - cannot refund");
        require(!booking.refunded, "Already refunded");
        require(
            block.timestamp < booking.startTime,
            "Cannot refund after start time"
        );
        
        // Mark as refunded
        booking.refunded = true;
        
        // Release slot
        slotBookings[booking.slotId] = 0;
        
        // Refund payment
        uint256 refundAmount = booking.amountPaid;
        payable(booking.userAddress).transfer(refundAmount);
        
        emit BookingRefunded(
            bookingId,
            booking.userAddress,
            refundAmount,
            block.timestamp
        );
    }
    
    /**
     * Get booking details
     * @param bookingId The booking ID to query
     */
    function getBooking(uint256 bookingId) public view returns (
        uint256 id,
        string memory slotId,
        address user,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        bool verified,
        bool refunded,
        uint256 createdAt
    ) {
        BookingReceipt memory booking = bookings[bookingId];
        require(booking.bookingId != 0, "Booking does not exist");
        
        return (
            booking.bookingId,
            booking.slotId,
            booking.userAddress,
            booking.amountPaid,
            booking.startTime,
            booking.endTime,
            booking.verified,
            booking.refunded,
            booking.createdAt
        );
    }
    
    /**
     * Get all bookings for a user
     * @param user The user address to query
     */
    function getUserBookings(address user) public view returns (uint256[] memory) {
        return userBookings[user];
    }
    
    /**
     * Get active booking for a slot
     * @param slotId The slot identifier to query
     */
    function getSlotBooking(string memory slotId) public view returns (uint256) {
        return slotBookings[slotId];
    }
    
    /**
     * Update hourly rate (owner only)
     * @param newRate The new hourly rate in MATIC
     */
    function setHourlyRate(uint256 newRate) public onlyOwner {
        uint256 oldRate = hourlyRate;
        hourlyRate = newRate;
        emit HourlyRateUpdated(oldRate, newRate);
    }
    
    /**
     * Authorize edge device (owner only)
     * @param device The device address to authorize
     * @param authorized Whether to authorize or revoke
     */
    function setDeviceAuthorization(address device, bool authorized) public onlyOwner {
        authorizedDevices[device] = authorized;
        emit DeviceAuthorized(device, authorized);
    }
    
    /**
     * Authorize operator (owner only)
     * @param operator The operator address to authorize
     * @param authorized Whether to authorize or revoke
     */
    function setOperatorAuthorization(address operator, bool authorized) public onlyOwner {
        authorizedOperators[operator] = authorized;
        emit OperatorAuthorized(operator, authorized);
    }
    
    /**
     * Withdraw contract balance (owner only)
     */
    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        payable(owner).transfer(balance);
    }
    
    /**
     * Transfer ownership (owner only)
     * @param newOwner The new owner address
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /**
     * Calculate verification hash for slot data
     * @param slotId The slot identifier
     * @param timestamp The verification timestamp
     * @param additionalData Additional verification data
     */
    function calculateVerificationHash(
        string memory slotId,
        uint256 timestamp,
        string memory additionalData
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(slotId, timestamp, additionalData));
    }
    
    /**
     * Get contract balance
     */
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * Get total booking count
     */
    function getTotalBookings() public view returns (uint256) {
        return bookingCounter;
    }
}