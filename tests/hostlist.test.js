import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"

// HostList.js is a QML JavaScript library. Load the shipped file with its
// pragma line removed, so the file under test is the file that ships.
const shipped = readFileSync(join(import.meta.dir, "..", "HostList.js"), "utf8")
const copy = join(mkdtempSync(join(tmpdir(), "hostlist-")), "HostList.cjs")
writeFileSync(copy, shipped.replace(/^\.pragma library\s*$/m, ""))
const HostList = createRequire(import.meta.url)(copy)

const CONFIG = String.raw`[General]
key="@ByteArray(-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n)"
width=2560

[hosts]
1\apps\1\hidden=false
1\apps\1\name=Steam Big Picture
1\apps\2\hidden=false
1\apps\2\name=Desktop
1\apps\size=2
1\hostname=studio-mini.local
1\localaddress=192.0.2.10
1\manualaddress=studio
1\srvcert="@ByteArray(-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----\n)"
1\uuid=11111111-2222-3333-4444-555555555555
2\apps\1\hidden=true
2\apps\1\name=Desktop
2\apps\2\hidden=false
2\apps\2\name="Big Game"
2\apps\size=2
2\hostname=tower
2\remoteaddress=198.51.100.7
2\uuid=AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE
3\hostname=no-uuid
4\hostname=bad-uuid
4\uuid=--help
size=4

[gcmapping]
size=0
`

describe("parseHosts", () => {
  test("lists paired hosts in order and skips entries without a valid uuid", () => {
    expect(HostList.parseHosts(CONFIG).map((host) => host.hostname)).toEqual(["studio-mini.local", "tower"])
  })

  test("prefers Desktop, then the first visible app", () => {
    const [first, second] = HostList.parseHosts(CONFIG)
    expect(first.app).toBe("Desktop")
    expect(second.app).toBe("Big Game")
  })

  test("names and addresses", () => {
    const [first, second] = HostList.parseHosts(CONFIG)
    expect([first.name, first.address]).toEqual(["studio-mini", "studio"])
    expect([second.name, second.address]).toEqual(["tower", "198.51.100.7"])
  })

  test("never carries keys or certificates", () => {
    const text = JSON.stringify(HostList.parseHosts(CONFIG))
    expect(text).not.toContain("PRIVATE KEY")
    expect(text).not.toContain("CERTIFICATE")
  })

  test("tolerates empty, truncated and hostile input", () => {
    expect(HostList.parseHosts("")).toEqual([])
    expect(HostList.parseHosts(null)).toEqual([])
    expect(HostList.parseHosts(CONFIG.slice(0, 200))).toEqual([])
    expect(HostList.parseHosts("[hosts]\n__proto__\\uuid=x\nconstructor\\hostname=y")).toEqual([])
  })
})

describe("streamCommand", () => {
  test("is a fixed binary and one argument per value", () => {
    const [first] = HostList.parseHosts(CONFIG)
    expect(HostList.streamCommand(first)).toEqual(["/usr/bin/moonlight", "stream", "11111111-2222-3333-4444-555555555555", "Desktop"])
  })

  test("refuses option-like, control-character and oversized app names", () => {
    const uuid = "11111111-2222-3333-4444-555555555555"
    for (const app of ["", "--help", "-x", "a\nb", "a\u0000b", "x".repeat(129)])
      expect(HostList.streamCommand({ uuid, app })).toBeNull()
  })

  test("refuses a uuid that is not one", () => {
    for (const uuid of ["", "--help", "11111111-2222-3333-4444-55555555555", "../etc"])
      expect(HostList.streamCommand({ uuid, app: "Desktop" })).toBeNull()
  })

  test("drops unsafe app names while parsing", () => {
    const hosts = HostList.parseHosts("[hosts]\n1\\uuid=11111111-2222-3333-4444-555555555555\n1\\hostname=h\n1\\apps\\1\\name=--quit-after\n")
    expect(hosts[0].app).toBe("")
    expect(HostList.streamCommand(hosts[0])).toBeNull()
  })
})

describe("launchEnvironment", () => {
  test("forwards only the allowlisted session variables and pins PATH", () => {
    const session = {
      HOME: "/home/someone", WAYLAND_DISPLAY: "wayland-1", XDG_RUNTIME_DIR: "/run/user/1000",
      PATH: "/tmp/evil:/usr/bin", LD_PRELOAD: "/tmp/evil.so", QT_PLUGIN_PATH: "/tmp/evil", SDL_VIDEODRIVER: "x11",
      LANG: ""
    }
    const environment = HostList.launchEnvironment((name) => session[name])
    expect(environment).toEqual({
      PATH: "/usr/bin:/bin", HOME: "/home/someone", WAYLAND_DISPLAY: "wayland-1", XDG_RUNTIME_DIR: "/run/user/1000"
    })
  })
})

describe("configPath", () => {
  test("uses an absolute XDG_CONFIG_HOME, else HOME/.config", () => {
    expect(HostList.configPath((name) => ({ XDG_CONFIG_HOME: "/cfg", HOME: "/home/a" })[name]))
      .toBe("/cfg/Moonlight Game Streaming Project/Moonlight.conf")
    expect(HostList.configPath((name) => ({ XDG_CONFIG_HOME: "relative", HOME: "/home/a" })[name]))
      .toBe("/home/a/.config/Moonlight Game Streaming Project/Moonlight.conf")
    expect(HostList.configPath(() => "")).toBe("")
  })
})

describe("isStreamWindow", () => {
  const host = { hostname: "tower" }
  test("matches Moonlight's stream title for this host only", () => {
    expect(HostList.isStreamWindow("com.moonlight_stream.Moonlight", "tower - Moonlight", host)).toBe(true)
    expect(HostList.isStreamWindow("com.moonlight_stream.Moonlight", "Moonlight", host)).toBe(false)
    expect(HostList.isStreamWindow("firefox", "tower - Moonlight", host)).toBe(false)
    expect(HostList.isStreamWindow("com.moonlight_stream.Moonlight", " - Moonlight", { hostname: "" })).toBe(false)
  })
})

test("the config read is bounded", () => {
  expect(HostList.CONFIG_READ_LIMIT).toBeLessThanOrEqual(1024 * 1024)
})
