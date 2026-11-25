import XCTest

/// Turns Sidedoor on in Settings, then checks that Safari sends x.com to a Nitter instance.
/// Needs a simulator past its first boot: a freshly erased one lists no apps in Settings for minutes.
@MainActor
final class RedirectTests: XCTestCase {
    let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    func testXRedirectsToNitterAndBack() throws {
        enableExtension()
        safari.launch()
        // The first instance check runs when the extension starts, so the first visits may load x.com.
        var host = ""
        for _ in 0..<6 {
            safari.open(URL(string: "https://x.com/jack")!)
            sleep(10)
            host = currentHost()
            if !host.isEmpty && !isX(host) { break }
        }
        attachScreenshot("Redirected")
        XCTAssertFalse(isX(host), "Safari stayed on \(host) instead of a Nitter instance")

        // "Open on x.com" turns redirects off for this tab only.
        safari.buttons["MoreMenuButton"].tap()
        safari.buttons["Sidedoor"].tap()
        let openOriginal = safari.buttons["Open on x.com"]
        XCTAssertTrue(openOriginal.waitForExistence(timeout: 10), "The popup has no Open on x.com button")
        openOriginal.tap()
        sleep(10)
        attachScreenshot("Bypassed")
        XCTAssertTrue(isX(currentHost()), "Open on x.com landed on \(currentHost())")
    }

    private func currentHost() -> String {
        let value = safari.textFields["TabBarItemTitle"].value as? String ?? ""
        return value.trimmingCharacters(in: .whitespaces.union(.init(charactersIn: "\u{200E}")))
    }

    private func isX(_ host: String) -> Bool { host.hasSuffix("x.com") || host.hasSuffix("twitter.com") }

    private func enableExtension() {
        // Safari lists the extension once its app has run, as it does after an install from TestFlight.
        XCUIApplication().launch()
        settings.launch()
        tap(settings, "Apps")
        tap(settings, "Safari")
        tap(settings, "Extensions")
        let sidedoor = settings.buttons["com.scowalt.sidedoor.extension"]
        XCTAssertTrue(sidedoor.waitForExistence(timeout: 10), "Safari doesn't list Sidedoor")
        sidedoor.tap()
        let allow = settings.switches["Allow Extension"].firstMatch
        XCTAssertTrue(allow.waitForExistence(timeout: 5))
        // The labelled switch spans the row; its toggle sits at the trailing edge.
        if allow.value as? String == "0" { allow.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap() }
        tap(settings, "All Websites")
        settings.cells["Allow"].tap()
    }

    private func tap(_ app: XCUIApplication, _ label: String) {
        let rows = NSPredicate(
            format: "(label == %@ OR identifier == %@) AND elementType IN %@",
            label, label, [XCUIElement.ElementType.button, .staticText, .cell].map(\.rawValue)
        )
        let target = app.descendants(matching: .any).matching(rows).firstMatch
        _ = target.waitForExistence(timeout: 10)
        // Settings lists are lazy: rows below the fold don't exist until scrolled to.
        for _ in 0..<10 where !(target.exists && target.isHittable) { app.swipeUp() }
        target.tap()
    }

    private func attachScreenshot(_ name: String) {
        let shot = XCTAttachment(screenshot: safari.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
