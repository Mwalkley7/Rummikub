export type TileColor = "red" | "blue" | "black" | "orange";

export type ZoneId = "board" | "pool" | "rack-0" | "rack-1" | "rack-2" | "rack-3";

export type Tile = {
  id: string;
  color: TileColor;
  number: number;
  isJoker?: false;
};

export type JokerTile = {
  id: string;
  isJoker: true;
};

export type GameTile = Tile | JokerTile;

export type Player = {
  id: number;
  name: string;
  isBot: boolean;
  rack: GameTile[];
  hasOpened: boolean;
};

export type BoardSet = {
  id: string;
  tiles: GameTile[];
};

export type GameStatus = "playing" | "won";

export type GameState = {
  players: Player[];
  board: BoardSet[];
  pool: GameTile[];
  currentPlayerIndex: number;
  turnSecondsLeft: number;
  turnStartedAt: number;
  selectedTileId: string | null;
  selectedSource: TileSource | null;
  message: string;
  winnerId: number | null;
  status: GameStatus;
  turnSnapshot: TurnSnapshot;
  turnMovedTileIds: string[];
  turnManipulatedBoardTile: boolean;
};

export type TileSource =
  | { type: "rack"; playerId: number; index: number }
  | { type: "board"; setId: string; index: number };

export type TurnSnapshot = {
  players: Player[];
  board: BoardSet[];
  pool: GameTile[];
};

export type ValidationResult = {
  valid: boolean;
  kind?: "group" | "run";
  value?: number;
  reason?: string;
};

const COLORS: TileColor[] = ["red", "blue", "black", "orange"];
const INITIAL_HAND_SIZE = 14;
const INITIAL_MELD_MINIMUM = 30;
export const TURN_SECONDS = 60;

export function createInitialGame(): GameState {
  const deck = shuffle(createDeck());
  const players: Player[] = [
    { id: 0, name: "You", isBot: false, rack: [], hasOpened: false },
    { id: 1, name: "Bot Ruby", isBot: true, rack: [], hasOpened: false },
    { id: 2, name: "Bot Slate", isBot: true, rack: [], hasOpened: false },
    { id: 3, name: "Bot Amber", isBot: true, rack: [], hasOpened: false },
  ];

  for (let round = 0; round < INITIAL_HAND_SIZE; round += 1) {
    players.forEach((player) => {
      const tile = deck.pop();
      if (tile) {
        player.rack.push(tile);
      }
    });
  }

  players.forEach((player) => {
    player.rack = sortTiles(player.rack);
  });

  const snapshot = makeSnapshot(players, [], deck);

  return {
    players,
    board: [],
    pool: deck,
    currentPlayerIndex: 0,
    turnSecondsLeft: TURN_SECONDS,
    turnStartedAt: Date.now(),
    selectedTileId: null,
    selectedSource: null,
    message: "Your turn. Make a 30+ point initial meld or draw.",
    winnerId: null,
    status: "playing",
    turnSnapshot: snapshot,
    turnMovedTileIds: [],
    turnManipulatedBoardTile: false,
  };
}

export function createDeck(): GameTile[] {
  const deck: GameTile[] = [];

  for (let copy = 1; copy <= 2; copy += 1) {
    COLORS.forEach((color) => {
      for (let number = 1; number <= 13; number += 1) {
        deck.push({
          id: `${color}-${number}-${copy}`,
          color,
          number,
        });
      }
    });
  }

  deck.push({ id: "joker-1", isJoker: true }, { id: "joker-2", isJoker: true });
  return deck;
}

export function sortTiles(tiles: GameTile[]): GameTile[] {
  return [...tiles].sort((a, b) => {
    if (a.isJoker && b.isJoker) {
      return a.id.localeCompare(b.id);
    }
    if (a.isJoker) {
      return 1;
    }
    if (b.isJoker) {
      return -1;
    }
    const colorDelta = COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
    return colorDelta || a.number - b.number || a.id.localeCompare(b.id);
  });
}

export function validateBoard(board: BoardSet[]): ValidationResult {
  if (board.length === 0) {
    return { valid: true, value: 0 };
  }

  let total = 0;
  for (const set of board) {
    if (set.tiles.length === 0) {
      continue;
    }
    const result = validateSet(set.tiles);
    if (!result.valid) {
      return {
        valid: false,
        reason: `Set ${board.indexOf(set) + 1}: ${result.reason ?? "invalid tiles"}`,
      };
    }
    total += result.value ?? 0;
  }

  return { valid: true, value: total };
}

export function validateSet(tiles: GameTile[]): ValidationResult {
  if (tiles.length < 3) {
    return { valid: false, reason: "sets need at least 3 tiles" };
  }

  const group = validateGroup(tiles);
  if (group.valid) {
    return group;
  }

  const run = validateRun(tiles);
  if (run.valid) {
    return run;
  }

  return { valid: false, reason: `${group.reason}; ${run.reason}` };
}

export function validateGroup(tiles: GameTile[]): ValidationResult {
  if (tiles.length < 3 || tiles.length > 4) {
    return { valid: false, reason: "groups must contain 3 or 4 tiles" };
  }

  const naturals = tiles.filter(isNaturalTile);
  const jokers = tiles.length - naturals.length;
  if (naturals.length === 0) {
    return { valid: false, reason: "a group needs at least one numbered tile" };
  }

  const targetNumber = naturals[0].number;
  if (!naturals.every((tile) => tile.number === targetNumber)) {
    return { valid: false, reason: "group numbers must match" };
  }

  const colors = new Set(naturals.map((tile) => tile.color));
  if (colors.size !== naturals.length) {
    return { valid: false, reason: "group colors cannot repeat" };
  }

  if (colors.size + jokers > COLORS.length) {
    return { valid: false, reason: "group cannot exceed four colors" };
  }

  return {
    valid: true,
    kind: "group",
    value: targetNumber * tiles.length,
  };
}

export function validateRun(tiles: GameTile[]): ValidationResult {
  if (tiles.length < 3) {
    return { valid: false, reason: "runs need at least 3 tiles" };
  }

  const naturals = tiles.filter(isNaturalTile);
  if (naturals.length === 0) {
    return { valid: false, reason: "a run needs at least one numbered tile" };
  }

  const color = naturals[0].color;
  if (!naturals.every((tile) => tile.color === color)) {
    return { valid: false, reason: "run colors must match" };
  }

  const seenNumbers = new Set<number>();
  for (const tile of naturals) {
    if (seenNumbers.has(tile.number)) {
      return { valid: false, reason: "run numbers cannot repeat" };
    }
    seenNumbers.add(tile.number);
  }

  let bestValue = -1;
  for (let start = 1; start <= 14 - tiles.length; start += 1) {
    const sequence = Array.from({ length: tiles.length }, (_, index) => start + index);
    const naturalNumbers = [...seenNumbers];
    const canFit = naturalNumbers.every((number) => sequence.includes(number));
    if (canFit) {
      const value = sequence.reduce((sum, number) => sum + number, 0);
      bestValue = Math.max(bestValue, value);
    }
  }

  if (bestValue < 0) {
    return { valid: false, reason: "run numbers must be consecutive" };
  }

  return { valid: true, kind: "run", value: bestValue };
}

export function scoreTiles(tiles: GameTile[]): number {
  return tiles.reduce((score, tile) => score + (tile.isJoker ? 30 : tile.number), 0);
}

export function canEndHumanTurn(state: GameState): { canEnd: boolean; reason?: string } {
  const boardValidation = validateBoard(state.board);
  if (!boardValidation.valid) {
    return { canEnd: false, reason: boardValidation.reason };
  }

  const player = state.players[state.currentPlayerIndex];
  if (!player.hasOpened) {
    if (state.turnManipulatedBoardTile) {
      return {
        canEnd: false,
        reason: "You must complete your 30-point opening meld before rearranging existing board tiles.",
      };
    }

    const openingValue = openingValueForTurn(state);
    if (openingValue < INITIAL_MELD_MINIMUM) {
      return {
        canEnd: false,
        reason: `Your initial meld needs ${INITIAL_MELD_MINIMUM}+ points from tiles played this turn. Current: ${openingValue}.`,
      };
    }
  }

  return { canEnd: true };
}

export function openingValueForTurn(state: GameState): number {
  const movedIds = new Set(state.turnMovedTileIds);
  let total = 0;

  state.board.forEach((set) => {
    if (set.tiles.length > 0 && set.tiles.every((tile) => movedIds.has(tile.id))) {
      total += validateSet(set.tiles).value ?? 0;
    }
  });

  return total;
}

export function prepareNextTurn(state: GameState, message: string): GameState {
  const nextIndex = nextPlayerIndex(state.currentPlayerIndex);
  const players = clonePlayers(state.players);
  const board = cloneBoard(state.board);
  const pool = [...state.pool];

  return {
    ...state,
    players,
    board,
    pool,
    currentPlayerIndex: nextIndex,
    turnSecondsLeft: TURN_SECONDS,
    turnStartedAt: Date.now(),
    selectedTileId: null,
    selectedSource: null,
    message,
    turnSnapshot: makeSnapshot(players, board, pool),
    turnMovedTileIds: [],
    turnManipulatedBoardTile: false,
  };
}

export function drawTile(state: GameState, playerId: number): GameState {
  if (state.pool.length === 0) {
    return {
      ...state,
      message: "The pool is empty. End your turn if the board is valid.",
    };
  }

  const pool = [...state.pool];
  const tile = pool.pop();
  const players = clonePlayers(state.players);
  const player = players[playerId];
  if (tile) {
    player.rack = sortTiles([...player.rack, tile]);
  }

  return {
    ...state,
    players,
    pool,
    selectedTileId: null,
    selectedSource: null,
    message: `${player.name} drew a tile.`,
  };
}

export function resetTurn(state: GameState): GameState {
  const players = clonePlayers(state.turnSnapshot.players);
  const board = cloneBoard(state.turnSnapshot.board);
  const pool = [...state.turnSnapshot.pool];

  return {
    ...state,
    players,
    board,
    pool,
    selectedTileId: null,
    selectedSource: null,
    turnSecondsLeft: TURN_SECONDS,
    turnStartedAt: Date.now(),
    message: "Turn reset to its starting layout.",
    turnMovedTileIds: [],
    turnManipulatedBoardTile: false,
  };
}

export function makeBotMove(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (!player.isBot || state.status !== "playing") {
    return state;
  }

  const candidate = findBotMeld(player.rack, player.hasOpened);
  if (!candidate) {
    const drawn = drawTile(state, player.id);
    return prepareNextTurn(drawn, `${player.name} could not play and drew a tile. ${nextTurnMessage(player.id)}`);
  }

  const players = clonePlayers(state.players);
  const bot = players[player.id];
  const playedIds = new Set(candidate.tiles.map((tile) => tile.id));
  bot.rack = bot.rack.filter((tile) => !playedIds.has(tile.id));
  bot.hasOpened = true;

  const board = [
    ...cloneBoard(state.board),
    {
      id: createSetId(),
      tiles: candidate.tiles,
    },
  ];

  const won = bot.rack.length === 0;
  const nextState: GameState = {
    ...state,
    players,
    board,
    selectedTileId: null,
    selectedSource: null,
    status: won ? "won" : "playing",
    winnerId: won ? bot.id : null,
    message: won
      ? `${bot.name} wins!`
      : `${bot.name} played ${candidate.tiles.length} tiles for ${candidate.value} points.`,
  };

  if (won) {
    return nextState;
  }

  return prepareNextTurn(nextState, `${bot.name} played ${candidate.tiles.length} tiles. ${nextTurnMessage(bot.id)}`);
}

export function findBotMeld(rack: GameTile[], hasOpened: boolean): { tiles: GameTile[]; value: number } | null {
  const candidates: { tiles: GameTile[]; value: number }[] = [];
  const sortedRack = sortTiles(rack);

  for (let size = Math.min(5, sortedRack.length); size >= 3; size -= 1) {
    combinations(sortedRack, size).forEach((combo) => {
      const result = validateSet(combo);
      if (result.valid) {
        candidates.push({ tiles: combo, value: result.value ?? 0 });
      }
    });
  }

  const playable = candidates
    .filter((candidate) => hasOpened || candidate.value >= INITIAL_MELD_MINIMUM)
    .sort((a, b) => b.value - a.value || b.tiles.length - a.tiles.length);

  return playable[0] ?? null;
}

export function moveTile(
  state: GameState,
  source: TileSource,
  destination: { type: "rack"; playerId: number; index?: number } | { type: "board"; setId: string; index?: number },
): GameState {
  const removed = removeTileAt(state, source);
  if (!removed.tile) {
    return state;
  }

  const added = addTileAt(removed.state, removed.tile, destination);
  const movedFromRack = source.type === "rack" && source.playerId === state.currentPlayerIndex;
  const manipulatedBoardTile =
    source.type === "board" ||
    (destination.type === "board" &&
      state.turnSnapshot.board.some((set) => set.id === destination.setId && set.tiles.length > 0));
  const movedIds = movedFromRack
    ? Array.from(new Set([...added.turnMovedTileIds, removed.tile.id]))
    : added.turnMovedTileIds;

  return {
    ...added,
    turnMovedTileIds: movedIds,
    turnManipulatedBoardTile: added.turnManipulatedBoardTile || manipulatedBoardTile,
    selectedTileId: null,
    selectedSource: null,
  };
}

export function removeTileAt(state: GameState, source: TileSource): { state: GameState; tile: GameTile | null } {
  if (source.type === "rack") {
    const players = clonePlayers(state.players);
    const rack = [...players[source.playerId].rack];
    const [tile] = rack.splice(source.index, 1);
    players[source.playerId].rack = rack;
    return { state: { ...state, players }, tile: tile ?? null };
  }

  const board = cloneBoard(state.board);
  const set = board.find((boardSet) => boardSet.id === source.setId);
  if (!set) {
    return { state, tile: null };
  }

  const [tile] = set.tiles.splice(source.index, 1);
  return { state: { ...state, board: board.filter((boardSet) => boardSet.tiles.length > 0) }, tile: tile ?? null };
}

export function addTileAt(
  state: GameState,
  tile: GameTile,
  destination: { type: "rack"; playerId: number; index?: number } | { type: "board"; setId: string; index?: number },
): GameState {
  if (destination.type === "rack") {
    const players = clonePlayers(state.players);
    const rack = [...players[destination.playerId].rack];
    rack.splice(destination.index ?? rack.length, 0, tile);
    players[destination.playerId].rack = rack;
    return { ...state, players };
  }

  const board = cloneBoard(state.board);
  let set = board.find((boardSet) => boardSet.id === destination.setId);
  if (!set) {
    set = { id: destination.setId, tiles: [] };
    board.push(set);
  }
  set.tiles.splice(destination.index ?? set.tiles.length, 0, tile);
  return { ...state, board };
}

export function clonePlayers(players: Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    rack: [...player.rack],
  }));
}

export function cloneBoard(board: BoardSet[]): BoardSet[] {
  return board.map((set) => ({
    ...set,
    tiles: [...set.tiles],
  }));
}

export function makeSnapshot(players: Player[], board: BoardSet[], pool: GameTile[]): TurnSnapshot {
  return {
    players: clonePlayers(players),
    board: cloneBoard(board),
    pool: [...pool],
  };
}

export function createSetId(): string {
  return `set-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function tileLabel(tile: GameTile): string {
  return tile.isJoker ? "J" : String(tile.number);
}

export function tileDescription(tile: GameTile): string {
  return tile.isJoker ? "Joker" : `${tile.color} ${tile.number}`;
}

export function isNaturalTile(tile: GameTile): tile is Tile {
  return !tile.isJoker;
}

function nextPlayerIndex(current: number): number {
  return (current + 1) % 4;
}

function nextTurnMessage(current: number): string {
  const nextIndex = nextPlayerIndex(current);
  return nextIndex === 0 ? "Your turn." : `Bot ${["Ruby", "Slate", "Amber"][nextIndex - 1]} is thinking.`;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function walk(start: number, combo: T[]): void {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      combo.push(items[index]);
      walk(index + 1, combo);
      combo.pop();
    }
  }

  walk(0, []);
  return result;
}
