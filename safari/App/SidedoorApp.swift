import SwiftUI

@main
struct SidedoorApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Image(systemName: "door.left.hand.open")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)
                Text("Turn on Sidedoor in Safari")
                    .font(.title2.bold())
                Text("Open Settings › Apps › Safari › Extensions › Sidedoor, turn it on, and allow it on all websites.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding(32)
        }
    }
}
