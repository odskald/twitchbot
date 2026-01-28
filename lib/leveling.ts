export function calculateLevel(totalXp: number): { level: number; nextLevelXp: number; progress: number } {
  let level = 1;
  let currentXp = totalXp;
  let xpForNextLevel = 100; // Base cost for Level 1 -> 2

  // Rate of increase per level (30%)
  const rate = 1.3;

  while (currentXp >= xpForNextLevel) {
    currentXp -= xpForNextLevel;
    level++;
    xpForNextLevel = Math.floor(xpForNextLevel * rate);
  }

  // At this point:
  // level = current level
  // currentXp = XP gained *into* this level (remainder)
  // xpForNextLevel = Total XP needed to complete this level and reach the next

  return {
    level,
    nextLevelXp: xpForNextLevel,
    progress: Math.floor((currentXp / xpForNextLevel) * 100)
  };
}
