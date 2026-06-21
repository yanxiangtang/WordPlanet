export type LetterTile = {
  id: string;
  letter: string;
};

export function buildShuffledLetterTiles(word: string): LetterTile[] {
  const letters = word.split("");
  if (letters.length <= 2) {
    return letters.map((letter, index) => ({ id: `${letter}-${index}`, letter }));
  }

  const shuffled = [...letters.slice(2), ...letters.slice(0, 2)];
  if (shuffled.join("") === word) shuffled.reverse();

  return shuffled.map((letter, index) => ({ id: `${letter}-${index}`, letter }));
}
