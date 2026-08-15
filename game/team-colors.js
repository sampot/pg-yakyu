const FALLBACK_COLORS = [
  '#176b87',
  '#7353ba',
  '#147d73',
  '#a56a16',
  '#456b2f',
  '#c43e62',
];

function normalizeHex(color, fallback) {
  const value = String(color || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(value) ? value : fallback;
}

function rgb(color) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function colorDistance(first, second) {
  const a = rgb(first);
  const b = rgb(second);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function resolveTeamColors(playerColor, opponentColor) {
  const player = normalizeHex(playerColor, '#b8322b');
  const requestedOpponent = normalizeHex(opponentColor, '#176b87');
  const opponent = colorDistance(player, requestedOpponent) >= 92
    ? requestedOpponent
    : FALLBACK_COLORS.find((color) => colorDistance(player, color) >= 92)
      ?? '#f1bd45';

  return { player, opponent };
}
