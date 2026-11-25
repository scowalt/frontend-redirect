import Foundation

/// Safari requires a principal class for the extension. Sidedoor sends no native messages, so it answers none.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: nil)
    }
}
