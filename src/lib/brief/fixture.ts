/**
 * Hand-written OpenUI Lang fixture (MOO-305 verification + /brief fallback
 * until MOO-311's Brief Agent writes real ones). Entity IDs verified against
 * seeded data — see plan Task 5 Step 1.
 */
export const fixtureBrief = [
  `root = Stack([header, intro, checklist, deadline, gov, govCompare, govMoney, tiffanyQuotes, house7])`,
  `header = BriefHeader()`,
  `intro = AssistantNote("Here's your guide to the August 11 primary. Contested races come first.")`,
  `checklist = VotingChecklist()`,
  `deadline = DeadlineBanner("absentee_request")`,
  `gov = RaceCard("WI-GOV-2026")`,
  `govCompare = CandidateCompareCard("WI-GOV-2026", ["joel-brennan", "francesca-hong", "tim-jacobson", "kelda-roys"])`,
  `govMoney = FinanceSnapshot("joel-brennan")`,
  `house7 = RaceCard("WI-US-HOUSE-D7-2026")`,
  `tiffanyQuotes = QuoteCard("tom-tiffany")`,
].join("\n");
