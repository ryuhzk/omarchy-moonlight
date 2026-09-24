# Moonlight Remote for Omarchy

The computers you stream with Moonlight, one click away on the Omarchy bar.

Moonlight already knows which hosts you have paired and which apps they offer.
This widget reads that and lists the hosts. Clicking one starts the stream
straight away, without opening Moonlight's host picker first. Closing the stream
window disconnects.

![The Moonlight Remote panel open under its bar icon, listing one paired
host](preview.png)

## What it does

- **The bar icon** is dim when nothing is streaming and bright while a stream
  window from one of your hosts is open.
- **The panel** lists every host Moonlight has paired with, by name, with the
  address Moonlight reaches it at.
- **Clicking a host** streams its `Desktop` app, or its first visible app when
  it has no `Desktop`. The stream uses the settings you saved in Moonlight —
  resolution, frame rate, bitrate, codec, audio and input — so there is nothing
  to set up here. Omarchy's window rule for Moonlight opens it fullscreen.
- **Clicking a host that is already streaming** brings its window forward
  instead of opening a second stream.
- **Closing the stream window** ends the stream. Super W does it, as it closes
  any window.

There are no settings. Pairing, adding and removing hosts, and every stream
option stay in Moonlight, where they already are.

The panel is keyboard-driven like the built-in ones: the arrow keys move
between hosts, Enter connects, Escape closes.

## Requirements

- Omarchy with the Quickshell-based shell (Quattro or newer).
- `moonlight-qt` at `/usr/bin/moonlight`. Omarchy ships it by default; if you
  removed it, reinstall the `moonlight-qt` package.
- At least one host paired in Moonlight. Open Moonlight once, add the host and
  enter the PIN it shows on the host (Sunshine, Apollo or GeForce Experience).
  After that you do not need to open Moonlight again.

Nothing is installed for you, and nothing here runs as root.

## Install

```bash
omarchy plugin add https://github.com/ryuhzk/omarchy-moonlight --enable
```

`omarchy plugin add` shows what it is about to clone and asks before doing it.
`--enable` puts the widget on the right of the bar. To place it somewhere else:

```bash
omarchy bar move ryuhzk.moonlight --section right --index 0
```

or use **Setup → Plugins → Moonlight Remote**.

If the icon does not appear straight away, restart the shell once:

```bash
omarchy restart shell
```

## Update

```bash
omarchy plugin update ryuhzk.moonlight
```

The update shows the diff before it applies anything.

## Remove

```bash
omarchy plugin remove ryuhzk.moonlight
```

It asks first. Then it takes the widget off the bar, removes its entry from
`~/.config/omarchy/shell.json`, and deletes the plugin's folder under
`~/.config/omarchy/plugins/`.

That is all there is to remove. The plugin writes no files of its own, so there
is no cache, state or log to clean up. Moonlight, its settings and your pairings
are left exactly as they were, because the plugin only ever reads them. A stream
that is open when you remove the plugin keeps running until you close its
window.

## Troubleshooting

| What you see | What it means |
|---|---|
| "No paired hosts" | Moonlight has no paired host yet. Pair one in Moonlight. |
| "Moonlight is not installed" | `/usr/bin/moonlight` is missing. Reinstall the `moonlight-qt` package. |
| "No app to stream" | The host lists no visible app. Unhide one in Moonlight, or add one on the host. |
| Clicking a host does nothing visible | Moonlight is connecting; it shows its own error window if the host is unreachable. |

## How it works

`Panel.qml` is the widget. `HostList.js` holds everything it decides — reading
Moonlight's host list, choosing the app, building the command and its
environment — with no access to the system, so it can be tested on its own.

A stream is started as one fixed command, with one argument per value and no
shell:

```
/usr/bin/moonlight stream <host uuid> <app name>
```

[SECURITY.md](SECURITY.md) lists everything the plugin reads and runs, and the
limits on each.

## Development

```bash
bun test
omarchy plugin validate .
```

The tests load the same `HostList.js` that ships.

## License

[MIT](LICENSE)
