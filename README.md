# Rummikub

Offline browser implementation of Rummikub for one human player against three bot players.

## Features

- Standard 106-tile Rummikub deck with two jokers.
- Four-player offline game: you, Bot Ruby, Bot Slate, and Bot Amber.
- 30-point initial meld requirement for every player.
- Joker-aware validation for groups and runs.
- 60-second human turn timer.
- Manual drag-and-drop tile movement.
- Board set rearrangement after opening.
- Reset turn support that restores the table, rack, and draw pile to the start of the turn.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run build
```
