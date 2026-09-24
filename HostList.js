.pragma library

// Everything the widget decides about Moonlight's hosts, kept out of the QML
// so that it can be tested on its own. Nothing in here touches the system.

var MOONLIGHT = "/usr/bin/moonlight"
var WINDOW_APP_ID = "com.moonlight_stream.Moonlight"
var CONFIG_READ_LIMIT = 262144

var HOST_FIELDS = ["uuid", "hostname", "manualaddress", "localaddress", "remoteaddress"]
var APP_FIELDS = ["name", "hidden"]
var UUID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

// Session variables Moonlight needs to open a window, find its settings, and
// reach audio and D-Bus. Anything that changes what code a process loads
// (LD_PRELOAD, QT_PLUGIN_PATH, SDL_* and the like) is deliberately absent.
var FORWARDED_ENVIRONMENT = [
  "HOME", "USER", "LANG", "LC_ALL",
  "XDG_RUNTIME_DIR", "WAYLAND_DISPLAY", "DBUS_SESSION_BUS_ADDRESS",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
  "XDG_CURRENT_DESKTOP", "XDG_SESSION_TYPE",
  "XCURSOR_THEME", "XCURSOR_SIZE"
]

function unquote(value) {
  var text = String(value).trim()
  if (text.length >= 2 && text.charAt(0) === "\"" && text.charAt(text.length - 1) === "\"")
    text = text.slice(1, -1)
  return text
}

function isIndex(text) {
  return /^[0-9]{1,4}$/.test(text)
}

// Read the [hosts] section of Moonlight's QSettings file. Only the fields
// named above are kept; the client key, host certificates and every other
// key are skipped without being stored.
function parseHosts(text) {
  var hosts = {}
  var inHosts = false
  var lines = String(text || "").split(/\r?\n/)
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (line.charAt(0) === "[" && line.charAt(line.length - 1) === "]") {
      inHosts = line === "[hosts]"
      continue
    }
    var equals = line.indexOf("=")
    if (!inHosts || equals <= 0) continue
    var parts = line.slice(0, equals).split("\\")
    var value = line.slice(equals + 1)
    if (!isIndex(parts[0])) continue
    var host = hosts[parts[0]] || (hosts[parts[0]] = { apps: {} })
    if (parts.length === 2 && HOST_FIELDS.indexOf(parts[1]) !== -1) {
      host[parts[1]] = unquote(value)
    } else if (parts.length === 4 && parts[1] === "apps" && isIndex(parts[2]) && APP_FIELDS.indexOf(parts[3]) !== -1) {
      var app = host.apps[parts[2]] || (host.apps[parts[2]] = {})
      app[parts[3]] = unquote(value)
    }
  }

  var result = []
  var keys = Object.keys(hosts).sort(function(a, b) { return Number(a) - Number(b) })
  for (var k = 0; k < keys.length; k++) {
    var entry = hosts[keys[k]]
    if (!UUID_PATTERN.test(entry.uuid || "")) continue
    var appKeys = Object.keys(entry.apps).sort(function(a, b) { return Number(a) - Number(b) })
    var visible = []
    for (var a = 0; a < appKeys.length; a++) {
      var candidate = entry.apps[appKeys[a]]
      if (candidate.hidden !== "true" && isSafeAppName(candidate.name)) visible.push(candidate.name)
    }
    var hostname = entry.hostname || ""
    var address = entry.manualaddress || entry.localaddress || entry.remoteaddress || ""
    result.push({
      uuid: entry.uuid,
      hostname: hostname,
      name: /\.local$/.test(hostname) ? hostname.slice(0, -6) : (hostname || address || entry.uuid),
      address: address,
      app: visible.indexOf("Desktop") !== -1 ? "Desktop" : (visible.length > 0 ? visible[0] : "")
    })
  }
  return result
}

// An app name becomes one argument to Moonlight. Refuse anything that could
// be read as an option, and anything that is not ordinary printable text.
function isSafeAppName(name) {
  var text = String(name || "")
  if (text.length === 0 || text.length > 128) return false
  if (text.charAt(0) === "-") return false
  return !/[\u0000-\u001f\u007f]/.test(text)
}

// The exact argument vector to stream a host, or null when the host cannot
// be streamed safely.
function streamCommand(host) {
  if (!host || !UUID_PATTERN.test(String(host.uuid || ""))) return null
  if (!isSafeAppName(host.app)) return null
  return [MOONLIGHT, "stream", String(host.uuid), String(host.app)]
}

// A closed environment holding only the forwarded session variables.
// `lookup` returns a variable's value, or an empty value when it is unset.
function launchEnvironment(lookup) {
  var environment = { PATH: "/usr/bin:/bin" }
  for (var i = 0; i < FORWARDED_ENVIRONMENT.length; i++) {
    var name = FORWARDED_ENVIRONMENT[i]
    var value = lookup(name)
    if (value !== undefined && value !== null && String(value) !== "") environment[name] = String(value)
  }
  return environment
}

// Where Moonlight keeps its settings: $XDG_CONFIG_HOME, else ~/.config.
function configPath(lookup) {
  var base = String(lookup("XDG_CONFIG_HOME") || "")
  if (base.charAt(0) !== "/") {
    var home = String(lookup("HOME") || "")
    if (home.charAt(0) !== "/") return ""
    base = home + "/.config"
  }
  return base + "/Moonlight Game Streaming Project/Moonlight.conf"
}

// Moonlight titles a stream window "<hostname> - Moonlight".
function isStreamWindow(appId, title, host) {
  return appId === WINDOW_APP_ID && !!host && host.hostname !== "" && title === host.hostname + " - Moonlight"
}

// Lets the test suite load this file outside QML; `module` is undefined there.
if (typeof module !== "undefined") {
  module.exports = {
    MOONLIGHT: MOONLIGHT, CONFIG_READ_LIMIT: CONFIG_READ_LIMIT, parseHosts: parseHosts,
    isSafeAppName: isSafeAppName, streamCommand: streamCommand, launchEnvironment: launchEnvironment,
    configPath: configPath, isStreamWindow: isStreamWindow
  }
}
