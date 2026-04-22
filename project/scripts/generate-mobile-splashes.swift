import AppKit
import Foundation

struct Theme {
  let name: String
  let title: String
  let subtitle: String
  let top: NSColor
  let bottom: NSColor
  let accent: NSColor
  let ring: NSColor
  let glow: NSColor
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  fputs("Usage: swift generate-mobile-splashes.swift /path/to/source.png\n", stderr)
  exit(1)
}

let sourcePath = args[1]
let outputDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("assets/mobile/generated")
try? FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

guard let sourceImage = NSImage(contentsOfFile: sourcePath) else {
  fputs("Could not load source image at \(sourcePath)\n", stderr)
  exit(1)
}

let themes: [Theme] = [
  Theme(
    name: "driver",
    title: "PENTHOUSE DRIVER",
    subtitle: "Trips, navigation, earnings",
    top: NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.10, alpha: 1),
    bottom: NSColor(calibratedRed: 0.12, green: 0.08, blue: 0.03, alpha: 1),
    accent: NSColor(calibratedRed: 0.79, green: 0.66, blue: 0.30, alpha: 1),
    ring: NSColor(calibratedRed: 0.99, green: 0.84, blue: 0.30, alpha: 1),
    glow: NSColor(calibratedRed: 1.00, green: 0.80, blue: 0.20, alpha: 0.22)
  ),
  Theme(
    name: "rider",
    title: "PENTHOUSE RIDER",
    subtitle: "Live tracking and trip support",
    top: NSColor(calibratedRed: 0.04, green: 0.09, blue: 0.14, alpha: 1),
    bottom: NSColor(calibratedRed: 0.08, green: 0.16, blue: 0.26, alpha: 1),
    accent: NSColor(calibratedRed: 0.18, green: 0.67, blue: 0.98, alpha: 1),
    ring: NSColor(calibratedRed: 0.96, green: 0.79, blue: 0.20, alpha: 1),
    glow: NSColor(calibratedRed: 0.18, green: 0.67, blue: 0.98, alpha: 0.22)
  ),
]

func roundedRectPath(_ rect: CGRect, radius: CGFloat) -> NSBezierPath {
  return NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func drawGradient(in rect: CGRect, top: NSColor, bottom: NSColor) {
  let gradient = NSGradient(starting: top, ending: bottom)
  gradient?.draw(in: NSBezierPath(rect: rect), angle: -90)
}

func savePNG(_ image: NSImage, to url: URL) throws {
  guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
  else {
    throw NSError(domain: "SplashGen", code: 1)
  }
  try png.write(to: url)
}

for theme in themes {
  let size = NSSize(width: 2732, height: 2732)
  let image = NSImage(size: size)
  image.lockFocus()

  let rect = CGRect(origin: .zero, size: size)
  drawGradient(in: rect, top: theme.top, bottom: theme.bottom)

  let context = NSGraphicsContext.current?.cgContext
  context?.saveGState()

  let radialColors = [theme.glow.cgColor, NSColor.clear.cgColor] as CFArray
  let radialLocations: [CGFloat] = [0, 1]
  let radialSpace = CGColorSpaceCreateDeviceRGB()
  if let gradient = CGGradient(colorsSpace: radialSpace, colors: radialColors, locations: radialLocations) {
    context?.drawRadialGradient(
      gradient,
      startCenter: CGPoint(x: rect.midX, y: rect.midY + 40),
      startRadius: 40,
      endCenter: CGPoint(x: rect.midX, y: rect.midY + 40),
      endRadius: 1150,
      options: [.drawsAfterEndLocation]
    )
  }

  let cardSize: CGFloat = 1040
  let cardRect = CGRect(x: (rect.width - cardSize) / 2, y: rect.height * 0.32, width: cardSize, height: cardSize)
  let shadow = NSShadow()
  shadow.shadowBlurRadius = 70
  shadow.shadowOffset = NSSize(width: 0, height: -24)
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
  shadow.set()

  NSColor.white.withAlphaComponent(0.08).setFill()
  roundedRectPath(cardRect.insetBy(dx: -12, dy: -12), radius: 110).fill()

  let cardPath = roundedRectPath(cardRect, radius: 96)
  NSColor(calibratedWhite: 1, alpha: 0.05).setFill()
  cardPath.fill()
  theme.ring.withAlphaComponent(0.35).setStroke()
  cardPath.lineWidth = 10
  cardPath.stroke()

  sourceImage.draw(in: cardRect, from: .zero, operation: .sourceOver, fraction: 1.0)

  let innerRing = roundedRectPath(cardRect.insetBy(dx: 24, dy: 24), radius: 78)
  theme.ring.withAlphaComponent(0.15).setStroke()
  innerRing.lineWidth = 6
  innerRing.stroke()

  let titleStyle = NSMutableParagraphStyle()
  titleStyle.alignment = .center

  let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 132, weight: .heavy),
    .foregroundColor: NSColor.white,
    .paragraphStyle: titleStyle,
    .kern: 2.5
  ]

  let subtitleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 58, weight: .medium),
    .foregroundColor: NSColor.white.withAlphaComponent(0.72),
    .paragraphStyle: titleStyle,
    .kern: 0.8
  ]

  let brandAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 44, weight: .bold),
    .foregroundColor: theme.accent,
    .paragraphStyle: titleStyle,
    .kern: 1.1
  ]

  NSAttributedString(string: "PENTHOUSE", attributes: brandAttributes)
    .draw(in: CGRect(x: 200, y: rect.height * 0.83, width: rect.width - 400, height: 60))

  NSAttributedString(string: theme.title, attributes: titleAttributes)
    .draw(in: CGRect(x: 150, y: rect.height * 0.74, width: rect.width - 300, height: 150))

  NSAttributedString(string: theme.subtitle, attributes: subtitleAttributes)
    .draw(in: CGRect(x: 240, y: rect.height * 0.69, width: rect.width - 480, height: 80))

  let footerRect = CGRect(x: 360, y: rect.height * 0.14, width: rect.width - 720, height: 110)
  let footerPath = roundedRectPath(footerRect, radius: 40)
  NSColor.white.withAlphaComponent(0.06).setFill()
  footerPath.fill()
  NSColor.white.withAlphaComponent(0.1).setStroke()
  footerPath.lineWidth = 3
  footerPath.stroke()

  let footerText = theme.name == "driver"
    ? "Built for drivers only"
    : "Built for riders only"
  let footerAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 48, weight: .semibold),
    .foregroundColor: NSColor.white.withAlphaComponent(0.82),
    .paragraphStyle: titleStyle
  ]
  NSAttributedString(string: footerText, attributes: footerAttributes)
    .draw(in: CGRect(x: footerRect.minX, y: footerRect.minY + 24, width: footerRect.width, height: 56))

  context?.restoreGState()
  image.unlockFocus()

  try savePNG(image, to: outputDir.appendingPathComponent("\(theme.name)-splash-2732.png"))
}

print("Generated themed driver/rider splash assets in \(outputDir.path)")
