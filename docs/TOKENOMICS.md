# Tokenomics

All money is native MON. Stakes are refundable principal, not an investment product: a participant can withdraw their own recorded amount after that post's staking deadline. The contract does not slash principal. Tipping transfers value immediately into creator and protocol pull balances; the default protocol fee is 2% and may only be changed by the owner up to 5%.

Reward pools are separate, explicitly funded MON. A Loom records creator, curator, and staker percentages whose sum must be at most 100%. A post's reward pool becomes claimable once the staking window closes. Each staker claims a pro-rata share of the staker allocation based on their stake divided by final post stake; creator and curator shares are individually claimable. Integer remainders and unallocated percentages remain in the contract: the current hub has no sweep function, so dust remains locked. Claims and withdrawals use pull accounting and are one-time.

The earliest eligible supporters are simply those who staked before the deadline; the contract does not rank users or guarantee a yield. A failed payout reverts and preserves the liability. Ranking is provisional/off-chain and never routes funds. Self-staking, Sybil activity, collusion, and wash activity are not solved by contract rules. Fund only what you can afford to lock until settlement.
