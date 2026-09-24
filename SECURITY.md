# Security

This document is for someone deciding whether to trust `ryuhzk.moonlight`. It
says what the plugin reads, what it runs, with which environment, and what it
deliberately does not do. Each claim names the code that makes it true, so it
can be checked rather than believed.

There is no sandbox. The widget is QML running inside `omarchy-shell` as the
desktop user, like every Omarchy plugin. What follows describes a small surface,
not an isolated one.

## What is in the plugin

| File          | What it is                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `Panel.qml`   | The bar widget and its panel                                            |
| `HostList.js` | Pure functions: parse the host list, validate, build command and environment |

There is no backend, no script, no hook, no service and no dependency. There is
no network access: the plugin opens no socket and makes no request. Moonlight,
once started, does its own networking to the host you chose.

## What it reads

One file, Moonlight's own settings:

```
$XDG_CONFIG_HOME/Moonlight Game Streaming Project/Moonlight.conf
```

(`~/.config/...` when `XDG_CONFIG_HOME` is unset or not absolute;
`HostList.configPath`).

- **Bounded.** The file is read by `/usr/bin/head -c 262144`, so no more than
  256 KiB ever reaches the shell, however large the file is
  (`HostList.CONFIG_READ_LIMIT`, `Panel.qml` `configReader`).
- **Read only.** Nothing in the plugin writes to it or to any other file.
- **Secrets are not kept.** The file also holds Moonlight's client private key
  and each host's certificate. `HostList.parseHosts` reads only the `[hosts]`
  section and, within it, only the fields `uuid`, `hostname`,
  `manualaddress`, `localaddress`, `remoteaddress`, and each app's `name` and
  `hidden`. Every other key, the key and certificates included, is skipped
  without being stored; `tests/hostlist.test.js` checks that neither survives
  parsing. The raw text is not logged or displayed.
- **Displayed as text.** Host names and addresses are shown with
  `textFormat: Text.PlainText`, so a crafted name cannot inject markup.

It also watches the list of open windows through Quickshell's Wayland
`ToplevelManager`, to tell whether a host is already streaming. That is an
in-process API; no command is run for it.

## What it runs

Three fixed executables, each by absolute path, each as an argument vector with
no shell, and never anything found through `PATH`:

| Command                                            | Why                          | Environment |
| -------------------------------------------------- | ---------------------------- | ----------- |
| `/usr/bin/head -c 262144 -- <Moonlight.conf>`      | Read the host list, bounded  | empty       |
| `/usr/bin/test -x /usr/bin/moonlight`              | Tell whether Moonlight is installed | empty |
| `/usr/bin/moonlight stream <uuid> <app>`           | Start a stream, when you click a host | closed allowlist |

All three are started with `clearEnvironment: true`.

**Arguments are validated before they reach Moonlight** (`HostList.streamCommand`):

- the host must be a UUID in the `8-4-4-4-12` hexadecimal form, so it can never
  be read as an option or a path;
- the app name must be 1 to 128 characters, must not begin with `-`, and must
  contain no control characters. An app that fails this is dropped while
  parsing, and a host with no valid app cannot be clicked.

**The stream's environment is a closed allowlist** (`HostList.launchEnvironment`).
Moonlight receives `PATH=/usr/bin:/bin` and, when set in the session, only:

```
HOME USER LANG LC_ALL
XDG_RUNTIME_DIR WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS
XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME
XDG_CURRENT_DESKTOP XDG_SESSION_TYPE
XCURSOR_THEME XCURSOR_SIZE
```

Variables that change what code a process loads — `LD_PRELOAD`,
`LD_LIBRARY_PATH`, `QT_PLUGIN_PATH`, `QML_IMPORT_PATH`, `SDL_*`, and anything
else not listed — are never passed on, so the shell's environment cannot be
used to load code into Moonlight. `tests/hostlist.test.js` asserts this.

The stream is started with `Quickshell.execDetached`, so it outlives a shell
restart and is not a child the shell waits on. It is deliberately not routed
through `uwsm-app`: that path hands the command to a shell `eval` and to systemd,
which expands `$` in arguments, and would put an app name from the config file
through two more interpreters.

## What it does not do

- It writes no files: no settings, cache, state or log. `shell.json` is changed
  only by Omarchy itself when you enable, move or remove the widget.
- It does not pair hosts, store PINs, or touch Moonlight's keys.
- It does not run anything as root and never asks for a password.
- It does not start anything on its own. A stream starts only when you click a
  host or press Enter on one.
- It does not register IPC beyond the standard open/close/toggle every Omarchy
  panel has.

## Reporting a problem

Open an issue at https://github.com/ryuhzk/omarchy-moonlight/issues. For
something you would rather not describe in public, say so in the issue and ask
for a private channel.
