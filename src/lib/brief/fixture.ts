/**
 * Hand-written OpenUI Lang shown to signed-out visitors and before a voter's
 * first brief. Every entity is on the November 3, 2026 ballot (checked against
 * production 2026-10-14). Both governor and attorney general contests are shown
 * with every name, in the state's order, so the sample favors no one.
 */
export const fixtureBrief = [
  `root = Stack([header, intro, checklist, deadline, gov, govCompare, ag, agCompare, house7])`,
  `header = BriefHeader()`,
  `intro = AssistantNote("Here's a sample brief for the November 3 general election. Statewide contests come first.")`,
  `checklist = VotingChecklist()`,
  `deadline = DeadlineBanner("absentee_request")`,
  `gov = RaceCard("WI-GOV-2026")`,
  `govCompare = CandidateCompareCard("WI-GOV-2026", ["tom-tiffany", "david-crowley"])`,
  `ag = RaceCard("WI-AG-2026")`,
  `agCompare = CandidateCompareCard("WI-AG-2026", ["eric-toney", "josh-kaul"])`,
  `house7 = RaceCard("WI-US-HOUSE-D7-2026")`,
].join("\n");
