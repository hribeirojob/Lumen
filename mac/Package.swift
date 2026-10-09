// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "Lumen",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "Lumen", targets: ["Lumen"]),
    .executable(name: "LumenIconHelper", targets: ["LumenIconHelper"])
  ],
  targets: [
    .executableTarget(
      name: "Lumen",
      path: "Sources"
    ),
    .executableTarget(
      name: "LumenIconHelper",
      path: "IconHelper",
      exclude: ["Info.plist"]
    )
  ]
)
