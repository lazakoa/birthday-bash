# Birthday Bash Mini Map

## Purpose

This document specifies the mini map and the large full-level map. It extends the game described in [01_game_design_document.md](01_game_design_document.md) and is implemented after the existing phases in [02_implementation.md](02_implementation.md).

The feature is a HUD convenience only. It must not change the isometric camera, world rendering, movement, combat, or dungeon generation rules.

## Overview

- During active play, a small floating mini map is always visible in the top-left corner of the HUD.
- The mini map shows a local crop of the current floor centered on the player, oriented to match the camera's yaw.
- The player appears on the mini map as a red dot.
- Pressing `M` opens a large map overlay showing the entire current floor.
- The large map pauses the game while it is open.
- Pressing `M` again or pressing `Escape` closes the large map.
- The mini map remains visible while the large map is closed and is restored after the large map closes.

## Controls and Key Conflicts

- `M` without modifiers toggles the large map while the game is in active play.
- `Shift+M` restores 25 mana. This debug shortcut moves from `M` so that `M` can be used for the map.
- `Escape` closes the large map when it is open. If the large map is not open, `Escape` keeps its existing behaviour.
- Key auto-repeat must not rapidly toggle the large map. Only the initial key press is processed.
- `M` is ignored when the game is not in active play, when class selection is showing, when the death or victory overlay is showing, or when the character and abilities panel is open. The game must never show two blocking overlays at once.
- While the large map is open, all gameplay input is ignored except the controls that close the map. This includes movement, attacks, ability hotkeys, debug shortcuts, and floor regeneration shortcuts.
- The mini map must not capture mouse input. Right-click movement and left-click targeting must continue to work when the cursor is over the mini map.
- The in-game help text must document `M` as the map key and `Shift+M` as the debug mana shortcut.

## Mini Map Layout

- The mini map is anchored to the top-left of the viewport with an 8 CSS pixel inset.
- Its default size is 176 by 176 CSS pixels, with the size and inset held in centralized configuration.
- It uses the same visual language as the existing HUD: dark translucent background, muted border, and a small amount of padding.
- It must not overlap the top-right character status panel, the bottom-left help text, the bottom-right combat log, or the bottom-centre ability bar.
- The existing top-left debug readout must move below the mini map so the two do not overlap.
- The mini map is rendered above the game canvas but below full-screen modal overlays.
- The mini map is hidden whenever the game is not in active play, including class selection, death, victory, and graphics-context-loss states.

## Mini Map Content and Scale

- The mini map shows a square local crop of the current floor, 24 by 24 tiles by default, with the number of visible tiles held in centralized configuration.
- The crop is centered on the player. The mini map samples a local area large enough to cover the rotated square, using the diagonal of the visible-tile window plus padding. When the player is close to a floor edge, sampling is clamped to the floor bounds and any uncovered area is drawn in the wall or background colour. The player dot stays centred and visible.
- The mini map is camera-up: it rotates around the player as camera yaw changes so that the camera's forward direction points up. Pitch does not rotate the mini map. It uses the tile grid directly and is not drawn with the isometric projection.
- The large map remains north-up and tile-aligned, independent of the mini map's rotation.
- Walkable tiles are drawn in a light, muted floor colour. Blocked tiles are drawn in a darker wall or background colour. The walkable layout must match the collision grid used by the game.
- There is no fog of war in this version. Every tile inside the local crop is shown.
- The player is a solid red dot with a thin dark outline. The dot is drawn at the player's exact position within the crop and is always the topmost mini map element.
- The dot must remain clearly visible at every supported window size and must be distinguishable from the floor and wall colours.
- Enemies, shrines, stairs, the boss exit, pickups, and the player's path are not shown in this version.

## Large Map Overlay

- The large map is a full-screen overlay that dims the game and presents a single centred map panel.
- The map panel shows the entire current floor at once. No scrolling, panning, or zooming is required, and no part of the playable level may be cut off.
- The entire floor is fit inside the panel with its aspect ratio preserved. A 144 by 144 tile floor must remain fully visible on both common desktop resolutions and smaller browser windows.
- The large map uses a north-up, tile-aligned orientation and the same floor and wall colour convention as the mini map, with a higher resolution.
- The player is shown as the same red dot, scaled so that it remains obvious on the larger map. It must be positioned at the player's exact floor position.
- The overlay includes the current floor identification, for example `The Lich's Den — Floor 3 of 5`, and a visible close hint such as `Press M or Esc to close`.
- The overlay includes a focusable close button for keyboard users. Opening the map moves focus to the close button; closing the map returns focus to the game canvas.
- The large map must be built from the same floor grid used by gameplay. It must not regenerate or approximate the level.
- Clicking outside the map panel, clicking the close button, pressing `M`, or pressing `Escape` closes the map.

## State and Lifecycle

- The large map can only open while the game state is `playing`.
- Opening the large map pauses simulation. While it is open, none of the following advance: player movement, enemy AI, the Lich, projectiles, area effects, summons, pickups, cooldowns, timed effects, shrine durations, or combat.
- The game must not accumulate a large elapsed-time step while the large map is open. When the map closes, the next simulation step must be a normal frame-sized step.
- The game renders beneath the overlay while paused, but the player cannot act and the game input is not forwarded.
- If the player dies, wins, restarts, or returns to class selection, the large map must close and the mini map must hide.
- If a floor is regenerated or a floor transition occurs, the map data, cached floor image, and player position must be rebuilt for the new floor. No data from the previous floor may remain visible.
- Restarting a run must remove all map state, cached images, DOM nodes, and event listeners associated with the previous run.

## Rendering and Performance

- The map must not introduce Three.js, PixiJS, Phaser, Babylon.js, or another rendering library or game engine. It may be drawn with a dedicated 2D canvas, with the existing raw WebGL renderer, or with HUD elements.
- The full floor should be cached into an offscreen image or texture when the floor is loaded. The mini map should sample the cached image for its local crop, and the large map should scale the same cached image.
- The floor cache is invalidated only when the floor changes. The mini map must not iterate over the entire floor grid or rebuild the full map image every frame.
- The player marker may update every frame. Map colours, borders, and labels update only when the floor changes or the overlay opens.
- Rendering must respect device pixel ratio so that the map is crisp rather than blurry.
- The map must not alter or duplicate the existing isometric camera, world-to-screen conversion, or WebGL resources.

## Configuration

The following values should live in centralized configuration rather than being hard-coded in HUD or gameplay logic:

- Mini map inset, size, number of visible tiles, and rotation crop padding.
- Mini map and large map background, floor, wall, border, and player-dot colours.
- Player-dot radius for the mini map and large map.
- Large map panel maximum width and height as a percentage of the viewport.
- Padding between the mini map and the debug readout.

Provisional defaults:

- Mini map inset: 8 CSS pixels.
- Mini map size: 176 by 176 CSS pixels.
- Visible tiles: 24 by 24.
- Rotation crop padding: 1 tile beyond the diagonal sampling window.
- Player dot colour: `#ff3b3b` with a dark outline.
- Player dot radius: 4 CSS pixels on the mini map, 6 CSS pixels on the large map.

## Acceptance Criteria

- The mini map is visible in the top-left during active play and is hidden during class selection, death, victory, and graphics-context-loss states.
- The mini map shows the correct local floor layout and updates its crop as the player moves.
- The player is always shown as a clearly visible red dot at the centre of the mini map, including when sampling is clamped near a floor edge.
- The mini map rotates with camera yaw so the camera's forward direction points up, and remains fixed when pitch changes.
- Mini map rotation is sampled from the collision grid with no gaps at intermediate yaw angles, and the large map stays north-up.
- Right-click movement and left-click targeting still work when the cursor is over the mini map.
- `M` opens the large map and pauses the game. `M` or `Escape` closes it and resumes the game without a timing jump.
- `Shift+M` restores mana, and `M` no longer restores mana.
- The large map shows the entire current floor at once with the correct layout and player position, on both regular and boss floors.
- The large map fits without scrolling at 1280 by 720 and 1920 by 1080, preserving aspect ratio.
- No gameplay action is possible while the large map is open, and no cooldowns, buffs, or enemy actions advance during that time.
- Floor transitions, floor regeneration, death, victory, and restart leave no stale map image, marker, DOM node, or listener.
- The map introduces no rendering library, no WebGL errors, and no measurable frame-rate regression.
