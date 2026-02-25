# Arc → Lucide Icon Mapping

Reference for the Arc Browser sidebar import (feature 029).

Arc icon names were extracted from the Arc.app binary. Each is mapped to the closest Lucide icon available in our extension's icon picker.

## Arc Icon Picker

![Arc Icon Picker](029-arc-icon-picker.jpg)

Individual icons extracted to `arc-icons/` via `tools/extract-arc-icons.py`.

## Mapping Table

Icons are listed row-by-row matching the Arc icon picker grid above.

### Row 1

| Arc Name        | Arc Icon                         | Lucide Name | Lucide (light)                                                                         | Lucide (dark)                                                                          | Notes                |
| --------------- | -------------------------------- | ----------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| `star`          | ![](arc-icons/star.png)          | `star`      | ![](https://api.iconify.design/lucide/star.svg?color=%23000000&width=44&height=44)     | ![](https://api.iconify.design/lucide/star.svg?color=%23ffffff&width=44&height=44)     |                      |
| `bookmark`      | ![](arc-icons/bookmark.png)      | `bookmark`  | ![](https://api.iconify.design/lucide/bookmark.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/bookmark.svg?color=%23ffffff&width=44&height=44) |                      |
| `heart`         | ![](arc-icons/heart.png)         | `heart`     | ![](https://api.iconify.design/lucide/heart.svg?color=%23000000&width=44&height=44)    | ![](https://api.iconify.design/lucide/heart.svg?color=%23ffffff&width=44&height=44)    |                      |
| `flag`          | ![](arc-icons/flag.png)          | `flag`      | ![](https://api.iconify.design/lucide/flag.svg?color=%23000000&width=44&height=44)     | ![](https://api.iconify.design/lucide/flag.svg?color=%23ffffff&width=44&height=44)     |                      |
| `flash`         | ![](arc-icons/flash.png)         | `zap`       | ![](https://api.iconify.design/lucide/zap.svg?color=%23000000&width=44&height=44)      | ![](https://api.iconify.design/lucide/zap.svg?color=%23ffffff&width=44&height=44)      | Lightning bolt       |
| `triangle`      | ![](arc-icons/triangle.png)      | `triangle`  | ![](https://api.iconify.design/lucide/triangle.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/triangle.svg?color=%23ffffff&width=44&height=44) |                      |
| `medical`       | ![](arc-icons/medical.png)       | `asterisk`  | ![](https://api.iconify.design/lucide/asterisk.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/asterisk.svg?color=%23ffffff&width=44&height=44) | Cross/asterisk shape |
| `notifications` | ![](arc-icons/notifications.png) | `bell`      | ![](https://api.iconify.design/lucide/bell.svg?color=%23000000&width=44&height=44)     | ![](https://api.iconify.design/lucide/bell.svg?color=%23ffffff&width=44&height=44)     |                      |

### Row 2

| Arc Name       | Arc Icon                        | Lucide Name          | Lucide (light)                                                                                              | Lucide (dark)                                                                                               | Notes                |
| -------------- | ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `bulb`         | ![](arc-icons/bulb.png)         | `lightbulb`          | ![](https://api.iconify.design/lucide/lightbulb.svg?color=%23000000&width=44&height=44)                     | ![](https://api.iconify.design/lucide/lightbulb.svg?color=%23ffffff&width=44&height=44)                     |                      |
| `shapes`       | ![](arc-icons/shapes.png)       | `shapes`             | ![](https://api.iconify.design/lucide/shapes.svg?color=%23000000&width=44&height=44)                        | ![](https://api.iconify.design/lucide/shapes.svg?color=%23ffffff&width=44&height=44)                        | Mountain/peaks shape |
| `grid`         | ![](arc-icons/grid.png)         | `layout-grid`        | ![](https://api.iconify.design/lucide/layout-grid.svg?color=%23000000&width=44&height=44)                   | ![](https://api.iconify.design/lucide/layout-grid.svg?color=%23ffffff&width=44&height=44)                   | 2x2 grid             |
| `apps`         | ![](arc-icons/apps.png)         | `grid-3x3`           | ![](https://api.iconify.design/lucide/grid-3x3.svg?color=%23000000&width=44&height=44)                      | ![](https://api.iconify.design/lucide/grid-3x3.svg?color=%23ffffff&width=44&height=44)                      | 3x3 grid             |
| `layers`       | ![](arc-icons/layers.png)       | `layers`             | ![](https://api.iconify.design/lucide/layers.svg?color=%23000000&width=44&height=44)                        | ![](https://api.iconify.design/lucide/layers.svg?color=%23ffffff&width=44&height=44)                        | Stacked layers       |
| `server`       | ![](arc-icons/albums.png)       | `database`           | ![](https://api.iconify.design/lucide/database.svg?color=%23000000&width=44&height=44)                      | ![](https://api.iconify.design/lucide/database.svg?color=%23ffffff&width=44&height=44)                      | Stacked discs        |
| `albums`       | ![](arc-icons/fileTrayFull.png) | `gallery-vertical-end` | ![](https://api.iconify.design/lucide/gallery-vertical-end.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/gallery-vertical-end.svg?color=%23ffffff&width=44&height=44)          | Box/tray             |
| `copy`         | ![](arc-icons/mail.png)         | `copy`               | ![](https://api.iconify.design/lucide/copy.svg?color=%23000000&width=44&height=44)                          | ![](https://api.iconify.design/lucide/copy.svg?color=%23ffffff&width=44&height=44)                          |                      |

### Row 3

| Arc Name             | Arc Icon                              | Lucide Name           | Lucide (light)                                                                                    | Lucide (dark)                                                                                     | Notes                   |
| -------------------- | ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| `folder`             | ![](arc-icons/folder.png)             | `folder-closed`       | ![](https://api.iconify.design/lucide/folder-closed.svg?color=%23000000&width=44&height=44)       | ![](https://api.iconify.design/lucide/folder-closed.svg?color=%23ffffff&width=44&height=44)       |                         |
| `fileTrayFull`       | ![](arc-icons/briefcase.png)          | `archive`             | ![](https://api.iconify.design/lucide/archive.svg?color=%23000000&width=44&height=44)             | ![](https://api.iconify.design/lucide/archive.svg?color=%23ffffff&width=44&height=44)             |                         |
| `calendar`           | ![](arc-icons/calendar.png)           | `calendar-days`       | ![](https://api.iconify.design/lucide/calendar-days.svg?color=%23000000&width=44&height=44)       | ![](https://api.iconify.design/lucide/calendar-days.svg?color=%23ffffff&width=44&height=44)       |                         |
| `mail`               | ![](arc-icons/envelope.png)           | `mail`                | ![](https://api.iconify.design/lucide/mail.svg?color=%23000000&width=44&height=44)                | ![](https://api.iconify.design/lucide/mail.svg?color=%23ffffff&width=44&height=44)                | Letter envelope         |
| `checkbox`           | ![](arc-icons/checkbox.png)           | `square-check-big`    | ![](https://api.iconify.design/lucide/square-check-big.svg?color=%23000000&width=44&height=44)    | ![](https://api.iconify.design/lucide/square-check-big.svg?color=%23ffffff&width=44&height=44)    | Checkmark in square     |
| `document`           | ![](arc-icons/file.png)               | `file`                | ![](https://api.iconify.design/lucide/file.svg?color=%23000000&width=44&height=44)                | ![](https://api.iconify.design/lucide/file.svg?color=%23ffffff&width=44&height=44)                |                         |
| `book`               | ![](arc-icons/book.png)               | `book-open`           | ![](https://api.iconify.design/lucide/book-open.svg?color=%23000000&width=44&height=44)           | ![](https://api.iconify.design/lucide/book-open.svg?color=%23ffffff&width=44&height=44)           | Open book               |
| `chatBubbleEllipses` | ![](arc-icons/chatBubbleEllipses.png) | `message-circle-more` | ![](https://api.iconify.design/lucide/message-circle-more.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/message-circle-more.svg?color=%23ffffff&width=44&height=44) | Speech bubble with dots |

### Row 4

| Arc Name       | Arc Icon                        | Lucide Name       | Lucide (light)                                                                                | Lucide (dark)                                                                                 | Notes            |
| -------------- | ------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| `people`       | ![](arc-icons/people.png)       | `users`           | ![](https://api.iconify.design/lucide/users.svg?color=%23000000&width=44&height=44)           | ![](https://api.iconify.design/lucide/users.svg?color=%23ffffff&width=44&height=44)           | Group of people  |
| `terminal`     | ![](arc-icons/terminal.png)     | `square-terminal` | ![](https://api.iconify.design/lucide/square-terminal.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/square-terminal.svg?color=%23ffffff&width=44&height=44) | Terminal prompt   |
| `construction` | ![](arc-icons/construction.png) | `wrench`          | ![](https://api.iconify.design/lucide/wrench.svg?color=%23000000&width=44&height=44)          | ![](https://api.iconify.design/lucide/wrench.svg?color=%23ffffff&width=44&height=44)          | Crossed wrenches |
| `square`       | ![](arc-icons/square.png)       | `square`          | ![](https://api.iconify.design/lucide/square.svg?color=%23000000&width=44&height=44)          | ![](https://api.iconify.design/lucide/square.svg?color=%23ffffff&width=44&height=44)          | Rounded square   |
| `egg`          | ![](arc-icons/ellipse.png)      | `egg`             | ![](https://api.iconify.design/lucide/egg.svg?color=%23000000&width=44&height=44)             | ![](https://api.iconify.design/lucide/egg.svg?color=%23ffffff&width=44&height=44)             | Oval/egg shape   |
| `ellipse`      | ![](arc-icons/circle.png)       | `circle`          | ![](https://api.iconify.design/lucide/circle.svg?color=%23000000&width=44&height=44)          | ![](https://api.iconify.design/lucide/circle.svg?color=%23ffffff&width=44&height=44)          | Full circle      |
| `moon`         | ![](arc-icons/moon.png)         | `moon`            | ![](https://api.iconify.design/lucide/moon.svg?color=%23000000&width=44&height=44)            | ![](https://api.iconify.design/lucide/moon.svg?color=%23ffffff&width=44&height=44)            | Crescent         |
| `sunny`        | ![](arc-icons/sunny.png)        | `sun`             | ![](https://api.iconify.design/lucide/sun.svg?color=%23000000&width=44&height=44)             | ![](https://api.iconify.design/lucide/sun.svg?color=%23ffffff&width=44&height=44)             |                  |

### Row 5

| Arc Name     | Arc Icon                      | Lucide Name        | Lucide (light)                                                                                 | Lucide (dark)                                                                                  | Notes              |
| ------------ | ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| `planet`     | ![](arc-icons/planet.png)     | `globe`            | ![](https://api.iconify.design/lucide/globe.svg?color=%23000000&width=44&height=44)            | ![](https://api.iconify.design/lucide/globe.svg?color=%23ffffff&width=44&height=44)            | Saturn-like planet |
| `leaf`       | ![](arc-icons/leaf.png)       | `leaf`             | ![](https://api.iconify.design/lucide/leaf.svg?color=%23000000&width=44&height=44)             | ![](https://api.iconify.design/lucide/leaf.svg?color=%23ffffff&width=44&height=44)             |                    |
| `cloud`      | ![](arc-icons/cloud.png)      | `cloud`            | ![](https://api.iconify.design/lucide/cloud.svg?color=%23000000&width=44&height=44)            | ![](https://api.iconify.design/lucide/cloud.svg?color=%23ffffff&width=44&height=44)            |                    |
| `paw`        | ![](arc-icons/paw.png)        | `paw-print`        | ![](https://api.iconify.design/lucide/paw-print.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/paw-print.svg?color=%23ffffff&width=44&height=44)        |                    |
| `bag`        | ![](arc-icons/bag.png)        | `shopping-bag`     | ![](https://api.iconify.design/lucide/shopping-bag.svg?color=%23000000&width=44&height=44)     | ![](https://api.iconify.design/lucide/shopping-bag.svg?color=%23ffffff&width=44&height=44)     | Crown/basket shape |
| `gift`       | ![](arc-icons/gift.png)       | `gift`             | ![](https://api.iconify.design/lucide/gift.svg?color=%23000000&width=44&height=44)             | ![](https://api.iconify.design/lucide/gift.svg?color=%23ffffff&width=44&height=44)             |                    |
| `bed`        | ![](arc-icons/bed.png)        | `bed-double`       | ![](https://api.iconify.design/lucide/bed-double.svg?color=%23000000&width=44&height=44)       | ![](https://api.iconify.design/lucide/bed-double.svg?color=%23ffffff&width=44&height=44)       |                    |
| `restaurant` | ![](arc-icons/restaurant.png) | `utensils-crossed` | ![](https://api.iconify.design/lucide/utensils-crossed.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/utensils-crossed.svg?color=%23ffffff&width=44&height=44) | Fork and knife     |

### Row 6

| Arc Name       | Arc Icon                        | Lucide Name  | Lucide (light)                                                                            | Lucide (dark)                                                                             | Notes                          |
| -------------- | ------------------------------- | ------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| `barbell`      | ![](arc-icons/barbell.png)      | `dumbbell`   | ![](https://api.iconify.design/lucide/dumbbell.svg?color=%23000000&width=44&height=44)    | ![](https://api.iconify.design/lucide/dumbbell.svg?color=%23ffffff&width=44&height=44)    |                                |
| `airplane`     | ![](arc-icons/airplane.png)     | `plane`      | ![](https://api.iconify.design/lucide/plane.svg?color=%23000000&width=44&height=44)       | ![](https://api.iconify.design/lucide/plane.svg?color=%23ffffff&width=44&height=44)       |                                |
| `musicalNote`  | ![](arc-icons/musicalNote.png)  | `music`      | ![](https://api.iconify.design/lucide/music.svg?color=%23000000&width=44&height=44)       | ![](https://api.iconify.design/lucide/music.svg?color=%23ffffff&width=44&height=44)       |                                |
| `colorPallete` | ![](arc-icons/colorPallete.png) | `palette`    | ![](https://api.iconify.design/lucide/palette.svg?color=%23000000&width=44&height=44)     | ![](https://api.iconify.design/lucide/palette.svg?color=%23ffffff&width=44&height=44)     | Art palette (note: Arc's typo) |
| `video`        | ![](arc-icons/video.png)        | `video`      | ![](https://api.iconify.design/lucide/video.svg?color=%23000000&width=44&height=44)       | ![](https://api.iconify.design/lucide/video.svg?color=%23ffffff&width=44&height=44)       | Video camera                   |
| `bandage`      | ![](arc-icons/bandage.png)      | `bandage`    | ![](https://api.iconify.design/lucide/bandage.svg?color=%23000000&width=44&height=44)     | ![](https://api.iconify.design/lucide/bandage.svg?color=%23ffffff&width=44&height=44)     | Band-aid shape                 |
| `code`         | ![](arc-icons/code.png)         | `code`       | ![](https://api.iconify.design/lucide/code.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/code.svg?color=%23ffffff&width=44&height=44)        | Angle brackets                 |
| `baseball`     | ![](arc-icons/baseball.png)     | `volleyball` | ![](https://api.iconify.design/lucide/volleyball.svg?color=%23000000&width=44&height=44)  | ![](https://api.iconify.design/lucide/volleyball.svg?color=%23ffffff&width=44&height=44)  | Stitched ball                  |

### Row 7

| Arc Name       | Arc Icon                        | Lucide Name    | Lucide (light)                                                                             | Lucide (dark)                                                                              | Notes           |
| -------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------- |
| `cloudOutline` | ![](arc-icons/cloudOutline.png) | `cloud`        | ![](https://api.iconify.design/lucide/cloud.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/cloud.svg?color=%23ffffff&width=44&height=44)        | Outline variant |
| `map`          | ![](arc-icons/controller.png)   | `map`          | ![](https://api.iconify.design/lucide/map.svg?color=%23000000&width=44&height=44)          | ![](https://api.iconify.design/lucide/map.svg?color=%23ffffff&width=44&height=44)          | Game controller |
| `bonfire`      | ![](arc-icons/bonfire.png)      | `flame`        | ![](https://api.iconify.design/lucide/flame.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/flame.svg?color=%23ffffff&width=44&height=44)        |                 |
| `pizza`        | ![](arc-icons/pizza.png)        | `pizza`        | ![](https://api.iconify.design/lucide/pizza.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/pizza.svg?color=%23ffffff&width=44&height=44)        |                 |
| `skull`        | ![](arc-icons/skull.png)        | `skull`        | ![](https://api.iconify.design/lucide/skull.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/skull.svg?color=%23ffffff&width=44&height=44)        |                 |
| `receipt`      | ![](arc-icons/receipt.png)      | `receipt-text` | ![](https://api.iconify.design/lucide/receipt-text.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/receipt-text.svg?color=%23ffffff&width=44&height=44) |                 |
| `thumbsUp`     | ![](arc-icons/thumbsUp.png)     | `thumbs-up`    | ![](https://api.iconify.design/lucide/thumbs-up.svg?color=%23000000&width=44&height=44)    | ![](https://api.iconify.design/lucide/thumbs-up.svg?color=%23ffffff&width=44&height=44)    |                 |
| `train`        | ![](arc-icons/train.png)        | `train-front`  | ![](https://api.iconify.design/lucide/train-front.svg?color=%23000000&width=44&height=44)  | ![](https://api.iconify.design/lucide/train-front.svg?color=%23ffffff&width=44&height=44)  |                 |

### Other (not in grid but found in binary)

| Arc Name    | Lucide Name      | Lucide (light)                                                                               | Lucide (dark)                                                                                | Notes                        |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| `briefcase` | `archive`        | ![](https://api.iconify.design/lucide/archive.svg?color=%23000000&width=44&height=44)        | ![](https://api.iconify.design/lucide/archive.svg?color=%23ffffff&width=44&height=44)        |                              |
| `envelope`  | `mail`           | ![](https://api.iconify.design/lucide/mail.svg?color=%23000000&width=44&height=44)           | ![](https://api.iconify.design/lucide/mail.svg?color=%23ffffff&width=44&height=44)           |                              |
| `file`      | `file`           | ![](https://api.iconify.design/lucide/file.svg?color=%23000000&width=44&height=44)           | ![](https://api.iconify.design/lucide/file.svg?color=%23ffffff&width=44&height=44)           |                              |
| `cursor`    | `mouse-pointer`  | ![](https://api.iconify.design/lucide/mouse-pointer.svg?color=%23000000&width=44&height=44)  | ![](https://api.iconify.design/lucide/mouse-pointer.svg?color=%23ffffff&width=44&height=44)  |                              |
| `disk`      | `save`           | ![](https://api.iconify.design/lucide/save.svg?color=%23000000&width=44&height=44)           | ![](https://api.iconify.design/lucide/save.svg?color=%23ffffff&width=44&height=44)           |                              |
| `stop`      | `square`         | ![](https://api.iconify.design/lucide/square.svg?color=%23000000&width=44&height=44)         | ![](https://api.iconify.design/lucide/square.svg?color=%23ffffff&width=44&height=44)         |                              |
| `tools`     | `wrench`         | ![](https://api.iconify.design/lucide/wrench.svg?color=%23000000&width=44&height=44)         | ![](https://api.iconify.design/lucide/wrench.svg?color=%23ffffff&width=44&height=44)         |                              |
| `pencil`    | `pencil`         | ![](https://api.iconify.design/lucide/pencil.svg?color=%23000000&width=44&height=44)         | ![](https://api.iconify.design/lucide/pencil.svg?color=%23ffffff&width=44&height=44)         |                              |
| `message`   | `message-square` | ![](https://api.iconify.design/lucide/message-square.svg?color=%23000000&width=44&height=44) | ![](https://api.iconify.design/lucide/message-square.svg?color=%23ffffff&width=44&height=44) |                              |
| `users`     | `users`          | ![](https://api.iconify.design/lucide/users.svg?color=%23000000&width=44&height=44)          | ![](https://api.iconify.design/lucide/users.svg?color=%23ffffff&width=44&height=44)          |                              |
| `github`    | `github`         | ![](https://api.iconify.design/lucide/github.svg?color=%23000000&width=44&height=44)         | ![](https://api.iconify.design/lucide/github.svg?color=%23ffffff&width=44&height=44)         |                              |
| `anchored`  | `anchor`         | ![](https://api.iconify.design/lucide/anchor.svg?color=%23000000&width=44&height=44)         | ![](https://api.iconify.design/lucide/anchor.svg?color=%23ffffff&width=44&height=44)         |                              |
| `circle`    | `circle`         | ![](https://api.iconify.design/lucide/circle.svg?color=%23000000&width=44&height=44)         | ![](https://api.iconify.design/lucide/circle.svg?color=%23ffffff&width=44&height=44)         | Fallback alias for `ellipse` |

## Notes

- Icon names come from `customInfo.iconType.icon` in Arc's `StorableSidebar.json`
- Unmapped icons fall back to `folder` in the import
- Lucide icons loaded from Iconify CDN: `https://api.iconify.design/lucide/{kebab-name}.svg`
- Light/dark variants use `?color=%23000000` (black) and `?color=%23ffffff` (white)
- If users report missing icons, add the Arc name to `ARC_ICON_TO_LUCIDE` in `src/utils/arcImport.ts`
