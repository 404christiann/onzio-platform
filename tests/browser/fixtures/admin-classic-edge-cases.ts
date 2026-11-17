export type AdminClassicEdgeItem = {
  id: string;
  name: string;
  email: string;
};

const longPlayerName = "Alexandria-Catherine María Fernández-Rodríguez de la Cruz Williams-Smith";
const unbreakableEmail = `alexandria.catherine.maria.fernandez.rodriguez.delacruz.williams.smith.${"x".repeat(60)}@example.invalid`;

export const adminClassicEdgeCases = {
  longClubName: "Diverse City Football Academy and Community Athletic Club of the Greater Metropolitan Region",
  longPlayerName,
  unbreakableEmail,
  zeroItems: [] as AdminClassicEdgeItem[],
  manyItems: Array.from({ length: 51 }, (_, index): AdminClassicEdgeItem => ({
    id: `edge-${index + 1}`,
    name: index === 0 ? longPlayerName : `Player ${String(index + 1).padStart(2, "0")} Alexandria-Catherine María Fernández-Rodríguez`,
    email: index === 0 ? unbreakableEmail : `player.${index + 1}.${"unbroken".repeat(8)}@example.invalid`,
  })),
};
