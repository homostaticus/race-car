**NEVER show sensitive data or personal information: the user is streaming live on Kick and the stream is recorded, so anything on screen is broadcast and saved permanently.** This covers email addresses, real name, phone, home address or location, account details, passwords, API keys, tokens, `.env` contents and payment details, in replies, command text and command output.

- Never write the user's email address anywhere, not even inside a command (e.g. don't grep for it literally).
- Never print secrets. If a file may hold keys or passwords (`.env`, config, credentials), check only whether a value is set, never its value.
- When checking for personal data, print only file names, counts or yes/no answers, never the matched text.
- Don't run commands that dump account or system details (`git config --list`, `env`, `gh auth status`, `whoami`, keychain, home-directory listings).
- Use project-relative paths and don't open files outside this folder unless asked.
- Commits use the GitHub noreply address set in this repo's local git config. Keep it that way and never set a personal email.

# Race Car

A browser game: dodge traffic on a three-lane road and score a point for every car you pass. Plain HTML, CSS and JavaScript with no build step and no dependencies.

## Running

Serve the folder with any static server and open it in a browser:

```
python3 -m http.server 56357
```

Ports 8000 and 8080 are taken by other apps on this machine.

## Files

- `index.html` – page layout: HUD (score, speed, best, mute), the game canvas with its start/crash overlay, touch buttons, and the "Your car" picker panel.
- `game.js` – game loop, steering, traffic spawning, collisions, scoring, car color picker and preview.
- `sound.js` – all sound effects, synthesized with the Web Audio API (no audio files). Exposes a global `sound` object that `game.js` calls.
- `style.css` – layout and theme. The car picker sits beside the game and docks below it on screens narrower than 660px.
- `thumbnail.png` – 1280×720 promo image.

## Game rules worth knowing

- Score = cars passed, 1 point each. A car counts once it is fully behind the player. Driving distance scores nothing.
- Every point plays the `sound.point()` coin sound exactly once. Simultaneous passes stagger their sounds by `POINT_SOUND_GAP`.
- Traffic never uses the player's chosen color.
- The car color can only be changed between races; the picker is locked while playing.
- Best score, car color and mute are saved in `localStorage` (`race-car-best-passes`, `race-car-color`, `race-car-muted`).

## Testing

There are no automated tests. Check changes in a real browser: headless Chrome driven over the DevTools protocol works well for checking state and taking screenshots.
