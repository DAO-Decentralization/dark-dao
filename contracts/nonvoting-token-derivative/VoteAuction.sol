// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

struct Bid {
    uint256 bidValue;
    address bidder;
}

contract VoteAuction {
    mapping(bytes32 => uint256) private auctionEnds;
    mapping(bytes32 => Bid) private currentBid;
    mapping(address => uint256) private refunds;
    uint256 public minimumBid;
    uint256 public auctionDuration;

    event AuctionCreated(bytes32 indexed hash, uint256 auctionEnd);
    event BidSubmitted(bytes32 indexed hash, uint256 value);

    constructor(uint256 _minimumBid, uint256 _auctionDuration) {
        minimumBid = _minimumBid;
        auctionDuration = _auctionDuration;
    }

    function createAuction(bytes32 hash) public payable {
        require(auctionEnds[hash] == 0, "Auction already initialized");
        auctionEnds[hash] = block.timestamp + auctionDuration;
        if (msg.value > 0) {
            bid(hash);
        }
        emit AuctionCreated(hash, auctionEnds[hash]);
    }

    function getMaxBid(bytes32 hash) public view returns (uint256) {
        return currentBid[hash].bidValue;
    }

    function bid(bytes32 hash) public payable {
        require(block.timestamp < auctionEnds[hash], "Auction has ended");
        require(msg.value >= minimumBid, "You must bid at least the minimum");
        require(msg.value > currentBid[hash].bidValue, "Another bid is greater than this one");
        if (currentBid[hash].bidValue > 0 && currentBid[hash].bidder != address(0)) {
            // Add to refund
            refunds[currentBid[hash].bidder] += currentBid[hash].bidValue;
        }
        currentBid[hash] = Bid({bidValue: msg.value, bidder: msg.sender});
        emit BidSubmitted(hash, msg.value);
    }

    function getAuctionWinner(bytes32 hash) internal view returns (address) {
        require(auctionEnds[hash] > 0, "Auction has not started");
        require(block.timestamp >= auctionEnds[hash], "Auction has not ended");
        return currentBid[hash].bidder;
    }

    function withdrawExcess() public {
        uint256 refund = refunds[msg.sender];
        refunds[msg.sender] = 0;
        payable(msg.sender).transfer(refund);
    }
}
