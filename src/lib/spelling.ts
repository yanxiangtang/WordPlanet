export type LetterTile = {
  id: string;
  letter: string;
};

function seededValue(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function rotateIfOriginal(letters: string[], word: string, seed: number): string[] {
  if (letters.join("") !== word || letters.length <= 2) return letters;
  const offset = (Math.abs(seed) % (letters.length - 1)) + 1;
  return [...letters.slice(offset), ...letters.slice(0, offset)];
}

export function buildShuffledLetterTiles(word: string, seed = 0): LetterTile[] {
  const letters = word.split("");
  if (letters.length <= 2) {
    return letters.map((letter, index) => ({ id: `${letter}-${index}`, letter }));
  }

  const shuffled = [...letters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(seededValue(seed + index * 101) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return rotateIfOriginal(shuffled, word, seed).map((letter, index) => ({ id: `${letter}-${index}`, letter }));
}
