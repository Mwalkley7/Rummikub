import { useEffect, useMemo, useState } from "react";
import {
  BoardSet,
  GameState,
  GameTile,
  TileSource,
  TURN_SECONDS,
  canEndHumanTurn,
  createInitialGame,
  drawTile,
  makeBotMove,
  moveTile,
  openingValueForTurn,
  prepareNextTurn,
  resetTurn,
  tileCopyLabel,
  tileDescription,
  tileLabel,
  validateBoard,
} from "./game";
import "./styles.css";

type DragPayload = TileSource;

const BOT_TURN_DELAY_MS = 900;

function App() {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const currentPlayer = game.players[game.currentPlayerIndex];
  const isHumanTurn = currentPlayer.id === 0 && game.status === "playing";
  const boardValidation = useMemo(() => validateBoard(game.board), [game.board]);
  const turnCheck = useMemo(() => canEndHumanTurn(game), [game]);
  const openingValue = useMemo(() => openingValueForTurn(game), [game]);

  useEffect(() => {
    if (game.status !== "playing") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "playing") {
          return current;
        }

        const elapsed = Math.floor((Date.now() - current.turnStartedAt) / 1000);
        const remaining = Math.max(0, TURN_SECONDS - elapsed);
        if (remaining > 0) {
          return { ...current, turnSecondsLeft: remaining };
        }

        const player = current.players[current.currentPlayerIndex];
        if (player.isBot) {
          return current;
        }

        const restored = resetTurn(current);
        const drawn = drawTile(restored, player.id);
        return prepareNextTurn(drawn, "Time expired. Your turn was reset, you drew a tile, and play moved on.");
      });
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [game.status]);

  useEffect(() => {
    if (game.status !== "playing" || !currentPlayer.isBot) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setGame((current) => makeBotMove(current));
    }, BOT_TURN_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [currentPlayer.id, currentPlayer.isBot, game.status]);

  function handleDrop(
    event: React.DragEvent<HTMLElement>,
    destination: { type: "rack"; playerId: number; index?: number } | { type: "board"; setId: string; index?: number },
  ) {
    event.preventDefault();
    if (!isHumanTurn) {
      return;
    }

    const payload = readDragPayload(event);
    if (!payload) {
      return;
    }

    const ownsRackTile = payload.type === "rack" && payload.playerId === 0;
    const manipulatesBoard = payload.type === "board";
    if (!ownsRackTile && !manipulatesBoard) {
      return;
    }

    if (
      manipulatesBoard &&
      !game.players[0].hasOpened &&
      destination.type === "board" &&
      destination.setId !== payload.setId
    ) {
      setGame((current) => ({
        ...current,
        message: "Complete your 30-point opening meld before rearranging existing board tiles.",
      }));
      return;
    }

    setGame((current) => moveTile(current, payload, destination));
  }

  function handleEndTurn() {
    if (!isHumanTurn) {
      return;
    }

    const check = canEndHumanTurn(game);
    if (!check.canEnd) {
      setGame((current) => ({
        ...current,
        message: check.reason ?? "The board is not ready yet.",
      }));
      return;
    }

    setGame((current) => {
      const players = current.players.map((player) =>
        player.id === 0 ? { ...player, hasOpened: true } : { ...player, rack: [...player.rack] },
      );
      const won = players[0].rack.length === 0;
      const closedState: GameState = {
        ...current,
        players,
        status: won ? "won" : "playing",
        winnerId: won ? 0 : null,
        message: won ? "You win!" : "Turn accepted.",
      };

      if (won) {
        return closedState;
      }

      return prepareNextTurn(closedState, "Turn accepted. Bot Ruby is thinking.");
    });
  }

  function handleDrawAndEnd() {
    if (!isHumanTurn) {
      return;
    }

    setGame((current) => {
      const restored = resetTurn(current);
      const drawn = drawTile(restored, 0);
      return prepareNextTurn(drawn, "You drew a tile. Bot Ruby is thinking.");
    });
  }

  function handleResetTurn() {
    if (!isHumanTurn) {
      return;
    }

    setGame((current) => resetTurn(current));
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <h1>Rummikub</h1>
        </div>
        <button className="secondary" type="button" onClick={() => setGame(createInitialGame())}>
          New game
        </button>
      </header>

      <section className="status-grid" aria-label="Game status">
        <StatusCard label="Current turn" value={currentPlayer.name} detail={currentPlayer.isBot ? "Bot thinking" : "Your move"} />
        <StatusCard label="Timer" value={`${game.turnSecondsLeft}s`} detail="60 seconds per turn" />
        <StatusCard label="Pool" value={`${game.pool.length} tiles`} detail="Draw pile remaining" />
        <StatusCard
          label="Opening meld"
          value={game.players[0].hasOpened ? "Complete" : `${openingValue}/30`}
          detail="New tiles must total 30+"
        />
      </section>

      <section className="message-bar" aria-live="polite">
        <strong>{game.status === "won" ? "Game over" : "Status"}:</strong> {game.message}
      </section>

      <section className="players" aria-label="Players">
        {game.players.map((player) => (
          <article className={player.id === currentPlayer.id ? "player active" : "player"} key={player.id}>
            <span>{player.name}</span>
            <strong>{player.rack.length} tiles</strong>
            <small>{player.hasOpened ? "Opened" : "Needs 30"}</small>
          </article>
        ))}
      </section>

      <section className="board-section">
        <div className="section-heading">
          <div>
            <h2>Board</h2>
            <p>Drop tiles into any open board space. Existing spaces can hold as many tiles as a valid set needs.</p>
          </div>
        </div>

        <div className="validation">
          {boardValidation.valid ? (
            <span className="valid">Board is valid.</span>
          ) : (
            <span className="invalid">{boardValidation.reason}</span>
          )}
        </div>

        <div className="board-grid" onDragOver={(event) => event.preventDefault()}>
          {game.board.map((set, index) => (
            <BoardSetView key={set.id} set={set} slotNumber={index + 1} onDrop={handleDrop} />
          ))}
        </div>
      </section>

      <section className="rack-section">
        <div className="section-heading">
          <div>
            <h2>Your rack</h2>
            <p>Drag your tiles to the board or back into your rack to reorder them.</p>
          </div>
          <div className="actions">
            <button type="button" onClick={handleEndTurn} disabled={!isHumanTurn || !turnCheck.canEnd}>
              End turn
            </button>
            <button className="secondary" type="button" onClick={handleDrawAndEnd} disabled={!isHumanTurn}>
              Draw and end
            </button>
            <button className="secondary" type="button" onClick={handleResetTurn} disabled={!isHumanTurn}>
              Reset turn
            </button>
          </div>
        </div>

        {!turnCheck.canEnd && isHumanTurn ? <p className="hint">{turnCheck.reason}</p> : null}

        <div
          className="rack"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, { type: "rack", playerId: 0 })}
        >
          {game.players[0].rack.map((tile, index) => (
            <TileView
              key={tile.id}
              tile={tile}
              source={{ type: "rack", playerId: 0, index }}
              disabled={!isHumanTurn}
              onDropBefore={(event) => handleDrop(event, { type: "rack", playerId: 0, index })}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="status-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function BoardSetView({
  set,
  slotNumber,
  onDrop,
}: {
  set: BoardSet;
  slotNumber: number;
  onDrop: (
    event: React.DragEvent<HTMLElement>,
    destination: { type: "board"; setId: string; index?: number },
  ) => void;
}) {
  return (
    <article
      className={set.tiles.length === 0 ? "set empty-board-slot" : "set"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDrop(event, { type: "board", setId: set.id });
      }}
    >
      {set.tiles.length === 0 ? (
        <span className="empty-set">Open space {slotNumber}</span>
      ) : null}
      {set.tiles.map((tile, index) => (
        <TileView
          key={tile.id}
          tile={tile}
          source={{ type: "board", setId: set.id, index }}
          onDropBefore={(event) => {
            event.stopPropagation();
            onDrop(event, { type: "board", setId: set.id, index });
          }}
        />
      ))}
    </article>
  );
}

function TileView({
  tile,
  source,
  disabled = false,
  onDropBefore,
}: {
  tile: GameTile;
  source: TileSource;
  disabled?: boolean;
  onDropBefore?: (event: React.DragEvent<HTMLElement>) => void;
}) {
  const className = tile.isJoker ? "tile joker" : `tile ${tile.color}`;
  const copyLabel = tileCopyLabel(tile);

  return (
    <button
      className={className}
      draggable={!disabled}
      type="button"
      title={tileDescription(tile)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-rummikub-tile", JSON.stringify(source));
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDropBefore?.(event);
      }}
      aria-label={tileDescription(tile)}
    >
      <span>{tileLabel(tile)}</span>
      <small>{copyLabel}</small>
    </button>
  );
}

function readDragPayload(event: React.DragEvent<HTMLElement>): DragPayload | null {
  const raw = event.dataTransfer.getData("application/x-rummikub-tile");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export default App;
