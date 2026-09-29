import AppKit

@MainActor
private final class SPPlaylistCell: NSTableCellView {
    let durationLabel = NSTextField(labelWithString: "")
}

@MainActor
final class SPPlaylistPanelView: NSView, NSTableViewDataSource, NSTableViewDelegate {
    struct Item {
        let url: URL
        let duration: Double?
    }

    var onSelect: ((URL) -> Void)?
    var onClose: (() -> Void)?

    private var items: [Item] = []
    private let titleLabel = NSTextField(labelWithString: L("playlist.title"))
    private let closeButton = NSButton()
    private let tableView = NSTableView()
    private let scrollView = NSScrollView()
    private let emptyLabel = NSTextField(wrappingLabelWithString: L("playlist.empty"))
    private var updating = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.94).cgColor

        titleLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textColor = .labelColor

        closeButton.bezelStyle = .regularSquare
        closeButton.isBordered = false
        closeButton.imagePosition = .imageOnly
        closeButton.image = NSImage(systemSymbolName: "xmark", accessibilityDescription: L("playlist.close"))?
            .withSymbolConfiguration(.init(pointSize: 13, weight: .medium))
        closeButton.contentTintColor = .secondaryLabelColor
        closeButton.toolTip = L("playlist.close")
        closeButton.target = self
        closeButton.action = #selector(closeTapped(_:))

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("playlist.item"))
        column.resizingMask = .autoresizingMask
        tableView.addTableColumn(column)
        tableView.headerView = nil
        tableView.delegate = self
        tableView.dataSource = self
        tableView.rowHeight = 48
        tableView.intercellSpacing = NSSize(width: 0, height: 1)
        tableView.selectionHighlightStyle = .regular
        tableView.backgroundColor = .clear
        tableView.focusRingType = .none

        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder

        emptyLabel.textColor = .secondaryLabelColor
        emptyLabel.alignment = .center
        emptyLabel.isHidden = true

        for view in [titleLabel, closeButton, scrollView, emptyLabel] {
            addSubview(view)
            view.translatesAutoresizingMaskIntoConstraints = false
        }
        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 18),
            titleLabel.topAnchor.constraint(equalTo: topAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: closeButton.leadingAnchor, constant: -8),
            closeButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            closeButton.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            closeButton.widthAnchor.constraint(equalToConstant: 28),
            closeButton.heightAnchor.constraint(equalToConstant: 28),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            scrollView.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 12),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            emptyLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 22),
            emptyLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -22),
            emptyLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func update(items: [Item], selectedIndex: Int) {
        self.items = items
        updating = true
        tableView.reloadData()
        if selectedIndex >= 0 && selectedIndex < items.count {
            tableView.selectRowIndexes(IndexSet(integer: selectedIndex), byExtendingSelection: false)
        } else {
            tableView.deselectAll(nil)
        }
        updating = false
        emptyLabel.isHidden = !items.isEmpty
        scrollView.isHidden = items.isEmpty
    }

    /// Reveal the current item only when the panel is explicitly opened. Live
    /// playback updates call `update` to move the highlight, but must not take
    /// control of a user's scroll position.
    func revealSelection() {
        let row = tableView.selectedRow
        guard row >= 0, row < items.count else { return }
        tableView.scrollRowToVisible(row)
    }

    func numberOfRows(in tableView: NSTableView) -> Int { items.count }

    func tableView(_ tableView: NSTableView,
                   viewFor tableColumn: NSTableColumn?,
                   row: Int) -> NSView? {
        guard row >= 0, row < items.count else { return nil }
        let identifier = NSUserInterfaceItemIdentifier("playlist.cell")
        let cell = tableView.makeView(withIdentifier: identifier, owner: self)
            as? SPPlaylistCell ?? makeCell(identifier: identifier)
        let item = items[row]
        cell.textField?.stringValue = item.url.lastPathComponent
        cell.textField?.toolTip = item.url.path
        if let duration = item.duration, duration > 0 {
            cell.durationLabel.stringValue = SPTimeText.clock(duration)
        } else {
            cell.durationLabel.stringValue = "—"
        }
        return cell
    }

    private func makeCell(identifier: NSUserInterfaceItemIdentifier) -> SPPlaylistCell {
        let cell = SPPlaylistCell()
        cell.identifier = identifier
        let title = NSTextField(labelWithString: "")
        title.font = .systemFont(ofSize: 12, weight: .regular)
        title.lineBreakMode = .byTruncatingMiddle
        let detail = cell.durationLabel
        detail.font = .monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        detail.textColor = .secondaryLabelColor
        detail.alignment = .right
        for view in [title, detail] {
            cell.addSubview(view)
            view.translatesAutoresizingMaskIntoConstraints = false
        }
        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 10),
            title.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            title.trailingAnchor.constraint(lessThanOrEqualTo: detail.leadingAnchor, constant: -8),
            detail.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -10),
            detail.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            detail.widthAnchor.constraint(equalToConstant: 58),
        ])
        cell.textField = title
        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        guard !updating else { return }
        let row = tableView.selectedRow
        guard row >= 0, row < items.count else { return }
        onSelect?(items[row].url)
    }

    @objc private func closeTapped(_ sender: Any?) { onClose?() }
}
