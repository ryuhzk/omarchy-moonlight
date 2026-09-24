import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "HostList.js" as HostList

Panel {
  id: root

  moduleName: "ryuhzk.moonlight"
  ipcTarget: "ryuhzk.moonlight"

  property var hosts: []
  property bool loaded: false
  property bool moonlightInstalled: true
  property int cursorIndex: 0
  property bool cursorActive: false

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string configPath: HostList.configPath(function(name) { return Quickshell.env(name) })
  readonly property var toplevels: ToplevelManager.toplevels.values
  readonly property bool anyStreaming: {
    for (var i = 0; i < hosts.length; i++) if (streamWindow(hosts[i]) !== null) return true
    return false
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function streamWindow(host) {
    var windows = root.toplevels
    for (var i = 0; i < windows.length; i++) {
      var window = windows[i]
      if (window && HostList.isStreamWindow(window.appId, window.title, host)) return window
    }
    return null
  }

  function refresh() {
    if (!moonlightCheck.running) moonlightCheck.running = true
    if (root.configPath !== "" && !configReader.running) configReader.running = true
    else if (root.configPath === "") { root.hosts = []; root.loaded = true }
  }

  function connectHost(host) {
    if (!host) return
    var existing = streamWindow(host)
    if (existing !== null) {
      existing.activate()
      root.close()
      return
    }
    var command = HostList.streamCommand(host)
    if (command === null) return
    Quickshell.execDetached({
      command: command,
      environment: HostList.launchEnvironment(function(name) { return Quickshell.env(name) }),
      clearEnvironment: true
    })
    root.close()
  }

  function moveCursor(dy) {
    if (hosts.length === 0) return
    cursorActive = true
    cursorIndex = Math.max(0, Math.min(hosts.length - 1, cursorIndex + dy))
  }

  Component.onCompleted: refresh()
  onOpenedChanged: if (opened) { cursorActive = false; refresh() }

  // Moonlight's settings are read by a fixed coreutils binary with nothing in
  // its environment, and never more than HostList.CONFIG_READ_LIMIT bytes.
  Process {
    id: configReader
    command: ["/usr/bin/head", "-c", String(HostList.CONFIG_READ_LIMIT), "--", root.configPath]
    environment: ({})
    clearEnvironment: true
    stdout: StdioCollector {
      onStreamFinished: {
        root.hosts = HostList.parseHosts(text)
        root.loaded = true
        if (root.cursorIndex >= root.hosts.length) root.cursorIndex = Math.max(0, root.hosts.length - 1)
      }
    }
  }

  Process {
    id: moonlightCheck
    command: ["/usr/bin/test", "-x", HostList.MOONLIGHT]
    environment: ({})
    clearEnvironment: true
    onExited: function(exitCode) { root.moonlightInstalled = exitCode === 0 }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰢹"
    dimmed: !root.anyStreaming
    tooltipText: root.opened ? "" : "Moonlight"
    onPressed: function(buttonCode) { root.toggle() }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(480))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: if (root.cursorActive) root.connectHost(root.hosts[root.cursorIndex])
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(10)

        PanelSectionHeader {
          text: "MOONLIGHT HOSTS"
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Text {
          visible: !root.moonlightInstalled || (root.loaded && root.hosts.length === 0)
          width: parent.width
          textFormat: Text.PlainText
          text: !root.moonlightInstalled
            ? "Moonlight is not installed. Install moonlight-qt first."
            : "No paired hosts. Pair one in Moonlight first."
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Repeater {
          model: root.moonlightInstalled ? root.hosts : []
          HostRow {
            required property var modelData
            required property int index
            width: column.width
            host: modelData
            rowIndex: index
          }
        }
      }
    }
  }

  component HostRow: CursorSurface {
    id: hostRow
    property var host: null
    property int rowIndex: 0
    readonly property bool streaming: root.streamWindow(host) !== null
    readonly property bool streamable: HostList.streamCommand(host) !== null

    hasCursor: root.cursorActive && root.cursorIndex === rowIndex
    current: streaming
    foreground: root.foreground
    opacity: streamable ? 1 : 0.5
    implicitHeight: rowContent.implicitHeight + Style.spacing.xl

    RowLayout {
      id: rowContent
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.space(10)

      Text {
        textFormat: Text.PlainText
        text: "󰍹"
        color: hostRow.streaming ? root.foreground : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.icon
        Layout.alignment: Qt.AlignVCenter
      }

      ColumnLayout {
        Layout.fillWidth: true
        spacing: Style.space(1)

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: hostRow.host ? String(hostRow.host.name) : ""
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          font.bold: hostRow.streaming
          elide: Text.ElideRight
        }

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: hostRow.streaming
            ? "Streaming · click to focus"
            : (!hostRow.streamable ? "No app to stream" : (hostRow.host ? String(hostRow.host.address) : ""))
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }
      }
    }

    MouseArea {
      anchors.fill: parent
      enabled: hostRow.streamable
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onEntered: { root.cursorActive = true; root.cursorIndex = hostRow.rowIndex }
      onClicked: root.connectHost(hostRow.host)
    }
  }
}
