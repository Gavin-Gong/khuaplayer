import AppKit

/// The subtitle panel owns selection UI only. File access and subtitle
/// lifetime remain in PlayerViewController so the panel can be dismissed and
/// recreated without interrupting playback.
@MainActor
final class SubtitleSettingsPanel: NSPanel {
    enum Slot {
        case primary
        case secondary
    }

    var onSelectionChanged: ((URL?, URL?) -> Void)?
    var onChooseFile: ((Slot) -> Void)?
    var onScaleChanged: ((Double) -> Void)?
    var onAutoLoadChanged: ((Bool) -> Void)?
    var onLanguageChanged: ((String, String) -> Void)?

    private let primaryPopup = NSPopUpButton(frame: .zero, pullsDown: false)
    private let secondaryPopup = NSPopUpButton(frame: .zero, pullsDown: false)
    private let primaryLanguagePopup = NSPopUpButton(frame: .zero, pullsDown: false)
    private let secondaryLanguagePopup = NSPopUpButton(frame: .zero, pullsDown: false)
    private let scaleSlider = NSSlider(value: 100, minValue: 25, maxValue: 300,
                                       target: nil, action: nil)
    private let scaleValue = NSTextField(labelWithString: "100%")
    private let autoLoadButton = NSButton(checkboxWithTitle: "", target: nil, action: nil)
    private var isUpdating = false

    init(candidates: [URL], primary: URL?, secondary: URL?, scale: Double,
         autoLoad: Bool, primaryLanguage: String, secondaryLanguage: String) {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 560, height: 360),
                   styleMask: [.titled, .closable],
                   backing: .buffered,
                   defer: true)
        title = L("subtitle.panel.title")
        isReleasedWhenClosed = false
        isMovableByWindowBackground = true
        level = .floating
        collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]

        primaryPopup.target = self
        primaryPopup.action = #selector(popupChanged(_:))
        secondaryPopup.target = self
        secondaryPopup.action = #selector(popupChanged(_:))
        primaryLanguagePopup.target = self
        primaryLanguagePopup.action = #selector(languageChanged(_:))
        secondaryLanguagePopup.target = self
        secondaryLanguagePopup.action = #selector(languageChanged(_:))

        scaleSlider.target = self
        scaleSlider.action = #selector(scaleChanged(_:))
        scaleSlider.isContinuous = true
        scaleValue.alignment = .right
        scaleValue.font = .monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        scaleValue.widthAnchor.constraint(equalToConstant: 48).isActive = true

        autoLoadButton.title = L("subtitle.panel.autoLoad")
        autoLoadButton.target = self
        autoLoadButton.action = #selector(autoLoadChanged(_:))

        let primaryRow = makeRow(label: L("subtitle.panel.primary"),
                                 popup: primaryPopup,
                                 chooseTitle: L("subtitle.panel.choose"),
                                 action: #selector(choosePrimary(_:)))
        let secondaryRow = makeRow(label: L("subtitle.panel.secondary"),
                                   popup: secondaryPopup,
                                   chooseTitle: L("subtitle.panel.choose"),
                                   action: #selector(chooseSecondary(_:)))
        let primaryLanguageRow = makeLanguageRow(label: L("subtitle.panel.primaryLanguage"),
                                                 popup: primaryLanguagePopup)
        let secondaryLanguageRow = makeLanguageRow(label: L("subtitle.panel.secondaryLanguage"),
                                                   popup: secondaryLanguagePopup)

        let hint = NSTextField(wrappingLabelWithString: L("subtitle.panel.hint"))
        hint.textColor = .secondaryLabelColor
        hint.font = .systemFont(ofSize: 11)

        let scaleLabel = NSTextField(labelWithString: L("subtitle.panel.scale"))
        let scaleRow = NSStackView(views: [scaleLabel, scaleSlider, scaleValue])
        scaleRow.orientation = .horizontal
        scaleRow.alignment = .centerY
        scaleRow.spacing = 10
        scaleSlider.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let close = NSButton(title: L("subtitle.panel.close"), target: self,
                             action: #selector(closePanel(_:)))
        close.keyEquivalent = "\u{1b}"

        let content = NSStackView(views: [primaryRow, primaryLanguageRow,
                                          secondaryRow, secondaryLanguageRow, hint,
                                          scaleRow, autoLoadButton, close])
        content.orientation = .vertical
        content.alignment = .leading
        content.spacing = 14

        for row in [primaryRow, primaryLanguageRow, secondaryRow,
                    secondaryLanguageRow, scaleRow] {
            row.widthAnchor.constraint(equalToConstant: 510).isActive = true
        }
        primaryPopup.widthAnchor.constraint(equalToConstant: 300).isActive = true
        secondaryPopup.widthAnchor.constraint(equalToConstant: 300).isActive = true
        primaryLanguagePopup.widthAnchor.constraint(equalToConstant: 300).isActive = true
        secondaryLanguagePopup.widthAnchor.constraint(equalToConstant: 300).isActive = true
        scaleSlider.widthAnchor.constraint(equalToConstant: 390).isActive = true
        close.alignment = .right

        let wrapper = NSView()
        wrapper.addSubview(content)
        content.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 24),
            content.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -24),
            content.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 22),
            content.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor, constant: -20),
        ])
        self.contentView = wrapper

        update(candidates: candidates, primary: primary, secondary: secondary,
               scale: scale, autoLoad: autoLoad,
               primaryLanguage: primaryLanguage, secondaryLanguage: secondaryLanguage)
    }

    private func makeRow(label: String, popup: NSPopUpButton,
                         chooseTitle: String, action: Selector) -> NSStackView {
        let labelField = NSTextField(labelWithString: label)
        labelField.widthAnchor.constraint(equalToConstant: 82).isActive = true
        let choose = NSButton(title: chooseTitle, target: self, action: action)
        let row = NSStackView(views: [labelField, popup, choose])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 10
        return row
    }

    private func makeLanguageRow(label: String, popup: NSPopUpButton) -> NSStackView {
        let labelField = NSTextField(labelWithString: label)
        labelField.widthAnchor.constraint(equalToConstant: 160).isActive = true
        let row = NSStackView(views: [labelField, popup])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 10
        return row
    }

    func update(candidates: [URL], primary: URL?, secondary: URL?,
                scale: Double, autoLoad: Bool,
                primaryLanguage: String, secondaryLanguage: String) {
        isUpdating = true
        let unique = Dictionary(grouping: candidates + [primary, secondary].compactMap { $0 },
                                by: { $0.standardizedFileURL.path })
            .compactMap { $0.value.first }
            .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
        configure(primaryPopup, candidates: unique, selected: primary)
        configure(secondaryPopup, candidates: unique, selected: secondary)
        configureLanguage(primaryLanguagePopup, selected: primaryLanguage)
        configureLanguage(secondaryLanguagePopup, selected: secondaryLanguage)
        scaleSlider.doubleValue = min(300, max(25, scale * 100))
        scaleValue.stringValue = String(format: "%.0f%%", scaleSlider.doubleValue)
        autoLoadButton.state = autoLoad ? .on : .off
        isUpdating = false
    }

    private func configure(_ popup: NSPopUpButton, candidates: [URL], selected: URL?) {
        popup.removeAllItems()
        popup.addItem(withTitle: L("subtitle.panel.off"))
        for url in candidates {
            popup.addItem(withTitle: url.lastPathComponent)
            popup.lastItem?.representedObject = url
        }
        if let selected,
           let index = popup.itemArray.firstIndex(where: {
               ($0.representedObject as? URL)?.standardizedFileURL == selected.standardizedFileURL
           }) {
            popup.selectItem(at: index)
        } else {
            popup.selectItem(at: 0)
        }
    }

    private func selectedURL(from popup: NSPopUpButton) -> URL? {
        popup.selectedItem?.representedObject as? URL
    }

    private func configureLanguage(_ popup: NSPopUpButton, selected: String) {
        popup.removeAllItems()
        for choice in SPSubtitleAutoload.languageChoices {
            popup.addItem(withTitle: languageTitle(for: choice))
            popup.lastItem?.representedObject = choice.id
        }
        let index = popup.itemArray.firstIndex {
            ($0.representedObject as? String) == selected
        } ?? 0
        popup.selectItem(at: index)
    }

    private func languageTitle(for choice: SPSubtitleAutoload.LanguageChoice) -> String {
        switch choice.id {
        case "default": return L("subtitle.language.default")
        case "en": return L("subtitle.language.english")
        case "zh": return L("subtitle.language.chinese")
        case "ja": return L("subtitle.language.japanese")
        case "ko": return L("subtitle.language.korean")
        case "es": return L("subtitle.language.spanish")
        case "fr": return L("subtitle.language.french")
        case "de": return L("subtitle.language.german")
        case "ru": return L("subtitle.language.russian")
        default: return choice.id
        }
    }

    private func selectedLanguage(from popup: NSPopUpButton) -> String {
        popup.selectedItem?.representedObject as? String ?? "default"
    }

    @objc private func popupChanged(_ sender: NSPopUpButton) {
        guard !isUpdating else { return }
        var primary: URL? = selectedURL(from: primaryPopup)
        var secondary: URL? = selectedURL(from: secondaryPopup)
        if let p = primary, let s = secondary,
           p.standardizedFileURL == s.standardizedFileURL {
            if sender === primaryPopup {
                secondaryPopup.selectItem(at: 0)
                secondary = nil
            } else {
                primaryPopup.selectItem(at: 0)
                primary = nil
            }
        }
        onSelectionChanged?(primary, secondary)
    }

    @objc private func languageChanged(_ sender: NSPopUpButton) {
        guard !isUpdating else { return }
        onLanguageChanged?(selectedLanguage(from: primaryLanguagePopup),
                           selectedLanguage(from: secondaryLanguagePopup))
    }

    @objc private func scaleChanged(_ sender: NSSlider) {
        guard !isUpdating else { return }
        scaleValue.stringValue = String(format: "%.0f%%", sender.doubleValue)
        onScaleChanged?(sender.doubleValue / 100.0)
    }

    @objc private func autoLoadChanged(_ sender: NSButton) {
        guard !isUpdating else { return }
        onAutoLoadChanged?(sender.state == .on)
    }

    @objc private func choosePrimary(_ sender: Any?) { onChooseFile?(.primary) }
    @objc private func chooseSecondary(_ sender: Any?) { onChooseFile?(.secondary) }

    @objc private func closePanel(_ sender: Any?) {
        if let parent = sheetParent {
            parent.endSheet(self)
        } else {
            orderOut(nil)
        }
    }
}
