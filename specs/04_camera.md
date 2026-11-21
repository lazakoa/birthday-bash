# Birthday Bash Camera Controls

## Purpose

This document specifies the player-adjustable camera. It extends the game described in [01_game_design_document.md](01_game_design_document.md) and the implementation plan in [02_implementation.md](02_implementation.md).

The camera remains an orbiting isometric camera that follows the player, but its orientation is no longer fixed. The player can turn it left and right and raise and lower its pitch. Where this document conflicts with the fixed-orientation camera statements in the earlier specs, this document takes precedence.

The change is view-only. It must not alter the tile grid, collision, movement speed, pathfinding, combat ranges, enemy AI, dungeon generation, or the mini-map and large-map functionality. The mini map rotates with camera yaw as described in [03_mini_map.md](03_mini_map.md).

## Overview

- Left and right arrow keys turn the camera continuously while held.
- Up and down arrow keys raise and lower the camera continuously while held.
- `V` snaps the camera back to the initial isometric view.
- The camera continues to follow the player at all times. Turning and raising do not detach it or move the player.
- The initial view is the current fixed isometric presentation, with a 45-degree yaw and a 30-degree pitch that produce the existing 64 by 32 tile diamonds.
- Camera distance and zoom are fixed. Up and down change pitch, not zoom.

## Controls and Key Conflicts

- `ArrowLeft` and `ArrowRight` turn the camera. The direction must match the key: left turns the view left, and right turns the view right.
- `ArrowUp` raises the camera to a higher, more top-down view. `ArrowDown` lowers it toward a shallower angle.
- Turning is driven by the currently held keys and sampled every simulation frame. Native key auto-repeat must not be used, because held state already provides continuous motion.
- If both left and right are held, the yaw change cancels. If both up and down are held, the pitch change cancels.
- Releasing a key stops its contribution immediately. Losing window focus clears all held camera keys, as the existing input layer already does for other keys.
- Only unmodified arrow keys control the camera. Presses with Ctrl, Alt, Meta, or with the intent of navigating an overlay must not turn the camera.
- Bare arrow keys must call `preventDefault` so the page does not scroll or move focus.
- `V` is the reset key. `Shift+V`, `Ctrl+V`, and the other modified variants are not camera controls. `V` is added to the game key set so it does not trigger unrelated browser behaviour.
- Camera controls are active only while the game state is `playing` and no blocking overlay is open. They are ignored during class selection, while the large map or character and abilities panel is open, on the death or victory overlay, and while the WebGL context is lost.
- Opening the large map freezes the camera along with the rest of the game. Arrow keys and `V` are ignored while it is open, and no camera change may be queued for when it closes.
- The arrow keys must not move the player. Player movement remains right-click only.
- The in-game help text and the README controls table must document the arrow keys and `V`.

## Camera Model

- The camera orbits a follow target that stays on the player. Existing follow smoothing and sharpness remain in effect; rotation happens around the follow target rather than around the screen origin.
- Yaw is the rotation of the camera around the vertical axis, measured counterclockwise as seen from above. The left arrow increases yaw and the right arrow decreases it.
- Pitch is the camera's elevation above the ground plane. The up arrow increases pitch and the down arrow decreases it.
- Yaw wraps continuously through 360 degrees with no visible jump.
- Pitch is clamped to 15 through 60 degrees inclusive. The upper limit is deliberately below vertical so the camera never looks straight down. Pressing beyond a limit must not overshoot, accumulate hidden rotation, or flip the view.
- Camera distance and the pixels-per-tile scale stay constant. There is no zoom control and pitch changes do not change apparent character size.
- The initial view is yaw 45 degrees and pitch 30 degrees. This is the existing isometric view and must be restored exactly by `V`.
- `V` resets yaw and pitch instantly in one frame. It does not teleport the player, move the follow target, reset follow smoothing, or change the game state. If an arrow key is still held after the reset, normal rotation resumes on the next frame.
- Turning and pitch rates must be frame-rate independent and must use the same clamped simulation delta used by the game loop. Returning to a backgrounded tab must not produce a large one-frame camera jump.

A reference projection for a ground point at tile coordinates `(tx, ty)` relative to the follow target `(cx, cy)` is:

```
dx = tx - cx
dy = ty - cy
rx = dx * cos(yaw) - dy * sin(yaw)
ry = dx * sin(yaw) + dy * cos(yaw)
screenX = viewportWidth  / 2 + rx * scale
screenY = viewportHeight / 2 + ry * scale * sin(pitch)
depth    = ry * cos(pitch)
```

At yaw 45 degrees, pitch 30 degrees, and `scale = 32 * sqrt(2)` CSS pixels per tile, this reduces to the current projection: `screenX` offset is `(dx - dy) * 32` and `screenY` offset is `(dx + dy) * 16`. Equivalent implementations are acceptable if they preserve the initial view and the same observable behaviour.

## Projection and Rendering

- Every world-space visual must use the camera transform: floor and alternate floor tiles, walls, stairs, shrines, the exit, pickups, enemies, the player, the Lich, projectiles, area effects, beams, sparks, click markers, shadows, health bars, and ground highlights.
- Ground geometry must actually rotate and foreshorten with the camera. Moving tile centres while leaving the original 64 by 32 diamond sprites unrotated is not sufficient, because that would leave gaps, overlaps, or tiles that do not follow the ground plane at intermediate yaw angles. Floor tile edges must remain contiguous at every yaw and pitch.
- Character, enemy, pickup, projectile, and effect sprites remain screen-aligned and upright. Only their ground anchor and draw order follow the camera; their art must not be rotated or sheared by yaw.
- Walls are rendered as camera-aligned blocks: their ground footprint follows the yaw and pitch transform while their vertical faces stay vertical on screen. Wall tops must tile continuously with the floor at every camera angle, without the fixed isometric top diamond sliding against the rotated ground plane.
- Ground-plane effects such as highlights, shadows, click markers, and area indicators must follow the same ground projection so they stay attached to their tiles.
- Occluders must be depth-sorted using the camera-space depth from the current yaw and pitch, farthest first. The order must update continuously while the camera turns. Stable tie-breaking must avoid visible flicker between objects at equal depth.
- Visible tile bounds and world culling must be derived from the inverse-transformed viewport corners, not from a fixed north-up rectangle. No floor tiles may be missing at the viewport edges at any supported yaw or pitch.
- At the initial yaw and pitch, the rendered scene must match the existing fixed-isometric baseline within one CSS pixel for unchanged game state.
- Rendering still uses raw WebGL. No Three.js, PixiJS, Phaser, Babylon.js, or other rendering library or game engine may be introduced.
- Rendering must continue to respect device pixel ratio so that rotated tiles and sprites remain crisp.
- HUD elements and the large map are screen-space and are not rotated. The mini map is screen-space but rotates its local floor crop around the player to match camera yaw, as specified in [03_mini_map.md](03_mini_map.md). Pitch does not rotate either map.
- The renderer must not introduce WebGL errors or a measurable frame-rate regression. Static level geometry may be batched or cached, but the implementation must not scan large amounts of off-screen geometry every frame.

## Pointer and Gameplay Interaction

- Screen-to-world conversion must invert the same yaw, pitch, follow target, and scale used for rendering. The existing subtraction-only conversion is not valid once the camera rotates.
- Right-click movement, left-click targeting, ability point targeting, hover tile display, enemy picking, and click markers must remain accurate at every yaw and pitch, at every supported window size, and at every supported device pixel ratio.
- Picking must use the same projected sprite anchor as rendering so that clicking the visible body of an enemy still selects that enemy when the view is rotated or pitched.
- The camera is a view transform only. Tile coordinates, world coordinates used by gameplay simulation, pathfinding, collision, ranges, and AI remain unchanged.
- Mouse input must not be captured by HUD elements while the camera is adjusted. The existing right-click movement and left-click targeting behaviour must continue to work immediately after turning the camera.

## State and Lifecycle

- A new run, restart, or return to class selection resets yaw and pitch to the initial view. The camera is also created with the initial view when the game first loads.
- Floor transitions, floor regeneration, and descending stairs preserve the player's current yaw and pitch within the run.
- Death and victory freeze the camera with the rest of the simulation. The view is reset only when a new run begins.
- Opening the large map pauses the camera and all gameplay time. Closing it resumes from the same yaw and pitch.
- Held camera keys must be cleared on window blur, game stop, restart, and context loss so the camera cannot drift after focus returns.
- No camera state may survive a restart through stale listeners, queued key presses, or a previously held-key set.

## Configuration

The following values must live in centralized configuration rather than being hard-coded in input or rendering code:

- Initial yaw and pitch.
- Minimum and maximum pitch.
- Yaw and pitch rates in degrees per second.
- Pixels-per-tile camera scale.
- Existing camera follow sharpness.
- Wall height, top inset, and wall face colours.

Provisional defaults:

- Initial yaw: 45 degrees.
- Initial pitch: 30 degrees.
- Pitch limits: 15 to 60 degrees.
- Yaw rate: 90 degrees per second.
- Pitch rate: 60 degrees per second.
- Camera scale: `32 * sqrt(2)` CSS pixels per tile, matching the current 64 by 32 tile projection.

## Out of Scope

- Zoom controls.
- Free panning or detaching the camera from the player.
- First-person or non-isometric views.
- Rotating character or enemy sprite art with the camera.
- Rotating the mini map or large map.
- Camera collision with walls or ceilings.
- Key rebinding for the camera controls.

## Acceptance Criteria

- Holding left or right turns the camera continuously in the correct direction and stops immediately on release.
- Holding up or down raises or lowers the pitch continuously, stays within the configured limits, and never flips the view.
- The same held duration produces the same camera angle at different frame rates, within reasonable tolerance.
- `V` restores the initial 45-degree yaw and 30-degree pitch in one frame, leaves the player and follow target in place, and keeps the camera following.
- At the initial view, the game looks the same as the previous fixed-isometric baseline within one CSS pixel.
- Arrow keys do not scroll the page, move the player, or trigger browser navigation. Native key auto-repeat does not cause accelerated motion.
- Camera controls do nothing during class selection, death, victory, the large map, the character and abilities panel, or WebGL context loss. Opening the large map freezes the camera with no queued movement.
- Right-click movement and left-click targeting remain accurate at minimum pitch, maximum pitch, and all yaw angles, including near 0 and 360 degrees.
- Floor tiles and wall footprints form a continuous ground plane with no gaps, overlaps, or jitter at intermediate yaw angles. Wall tops stay aligned with the floor while wall faces remain vertical.
- Draw order updates correctly while turning, with no popping or flicker between walls, enemies, and the player.
- No floor tiles disappear at the viewport edges at any supported camera angle or window size.
- The mini map rotates with camera yaw and the large map remains north-up. Neither map is affected by camera pitch.
- Restarting or returning to class selection restores the initial view. Floor transitions preserve the current view.
- No rendering library is added, the browser console remains free of shader and WebGL errors, and frame rate does not measurably regress.
- The in-game help text and README controls table list the arrow keys and `V`.
