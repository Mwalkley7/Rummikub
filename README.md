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

## Browser deployment

This repository includes a GitHub Pages workflow. After the app is merged to
`main`, enable GitHub Pages with **Source: GitHub Actions** in the repository
settings. The deployed game will be available at:

```text
https://mwalkley7.github.io/Rummikub/
```

## Verification

```bash
npm run lint
npm run build
```
