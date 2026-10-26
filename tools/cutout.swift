// Вырезать объект с фото (Vision, маска переднего плана) и поставить на светлый фон с мягкой тенью — стиль фото роботов урока 0.2.
//   swiftc -O -o cutout cutout.swift -framework Vision -framework CoreImage -framework AppKit
//   cutout <in> <out.jpg> [instances: all | 1,2] [W] [H] [bgRef.jpg — откуда взять цвет фона]
// Переменная ERASE="x0,y0,x1,y1;!x0,y0,x1,y1…" (от верха, в пикселях результата): внутри прямоугольников убираются только почти чёрные
// или красные пиксели, а с «!» — все пиксели — чужие предметы, попавшие в маску рядом со светлым роботом; сам робот (светлый) остаётся.
// Края маски делаются чётче (полупрозрачный ореол исходного фона убирается).
import Foundation
import Vision
import CoreImage
import AppKit

let a = CommandLine.arguments
let inPath = a[1], outPath = a[2]
let sel = a.count > 3 ? a[3] : "all"
let W = a.count > 4 ? Int(a[4])! : 720
let H = a.count > 5 ? Int(a[5])! : 540
var bg = CIColor(red: 0.945, green: 0.937, blue: 0.914)
if a.count > 6, let ref = NSImage(contentsOfFile: a[6]), let rep = NSBitmapImageRep(data: ref.tiffRepresentation!), let c = rep.colorAt(x: 3, y: 3) {
  bg = CIColor(red: c.redComponent, green: c.greenComponent, blue: c.blueComponent)
}
guard let src = CIImage(contentsOf: URL(fileURLWithPath: inPath)) else { fatalError("no image") }
let handler = VNImageRequestHandler(ciImage: src, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let obs = req.results?.first else { fatalError("no foreground found") }
print("instances:", obs.allInstances.count)
func bbox(_ pb: CVPixelBuffer) -> (Int, Int, Int, Int, Double) {
  CVPixelBufferLockBaseAddress(pb, .readOnly); defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  let fmt = CVPixelBufferGetPixelFormatType(pb), base = CVPixelBufferGetBaseAddress(pb)!
  var x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0
  for y in 0..<h { for x in 0..<w {
    let v: Float = fmt == kCVPixelFormatType_OneComponent32Float ? base.advanced(by: y * bpr + x * 4).assumingMemoryBound(to: Float.self).pointee : Float(base.advanced(by: y * bpr + x).assumingMemoryBound(to: UInt8.self).pointee) / 255
    if v > 0.5 { n += 1; if x < x0 { x0 = x }; if x > x1 { x1 = x }; if y < y0 { y0 = y }; if y > y1 { y1 = y } }
  } }
  return (x0, y0, x1, y1, Double(n) / Double(w * h))
}
for i in obs.allInstances {
  let b = bbox(try obs.generateScaledMaskForImage(forInstances: IndexSet(integer: i), from: handler))
  print("instance \(i): x \(b.0)-\(b.2), y \(b.1)-\(b.3) (от верха), площадь \(String(format: "%.1f", b.4 * 100))%")
}
let chosen: IndexSet = sel == "all" ? obs.allInstances : IndexSet(sel.split(separator: ",").map { Int($0)! })
let cut = CIImage(cvPixelBuffer: try obs.generateMaskedImage(ofInstances: chosen, from: handler, croppedToInstancesExtent: true))
let cw = cut.extent.width, ch = cut.extent.height
let s = min(Double(W) * 0.86 / cw, Double(H) * 0.84 / ch)
let dx = (Double(W) - cw * s) / 2, dy = (Double(H) - ch * s) / 2 + Double(H) * 0.03
let frame = CGRect(x: 0, y: 0, width: W, height: H)
var placed = cut.transformed(by: CGAffineTransform(translationX: -cut.extent.minX, y: -cut.extent.minY)).transformed(by: CGAffineTransform(scaleX: s, y: s)).transformed(by: CGAffineTransform(translationX: dx, y: dy))
let ctx = CIContext()

// Попиксельная чистка: чёткие края и удаление чужих тёмных/цветных пикселей внутри прямоугольников ERASE
var rects: [(Int, Int, Int, Int, Bool)] = []  // x0, y0, x1, y1, всё ли удалять («!» перед прямоугольником)
if let e = ProcessInfo.processInfo.environment["ERASE"] {
  for r in e.split(separator: ";") { let all = r.hasPrefix("!"); let v = r.drop(while: { $0 == "!" }).split(separator: ",").map { Int($0)! }; rects.append((v[0], v[1], v[2], v[3], all)) }
}
let cgP = ctx.createCGImage(placed, from: frame)!
var buf = [UInt8](repeating: 0, count: W * H * 4)
let bc = CGContext(data: &buf, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
bc.draw(cgP, in: frame)
func smooth(_ e0: Double, _ e1: Double, _ x: Double) -> Double { let t = min(max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t) }
var erased = 0
for y in 0..<H { for x in 0..<W {
  let i = (y * W + x) * 4
  let a0 = Double(buf[i + 3]) / 255
  if a0 == 0 { continue }
  let r = min(Double(buf[i]) / 255 / a0, 1), g = min(Double(buf[i + 1]) / 255 / a0, 1), b = min(Double(buf[i + 2]) / 255 / a0, 1)
  var a1 = smooth(0.30, 0.75, a0)
  for rc in rects where x >= rc.0 && x < rc.2 && y >= rc.1 && y < rc.3 {
    let luma = 0.299 * r + 0.587 * g + 0.114 * b, sat = max(r, g, b) - min(r, g, b)
    // чужое: почти чёрное (рама тележки) или красное; серая тень на самом роботе остаётся
    if rc.4 || luma < 0.22 || (sat > 0.30 && r > g + 0.08) { a1 = 0; erased += 1 }
  }
  buf[i] = UInt8(r * a1 * 255); buf[i + 1] = UInt8(g * a1 * 255); buf[i + 2] = UInt8(b * a1 * 255); buf[i + 3] = UInt8(a1 * 255)
} }
if !rects.isEmpty { print("erased pixels:", erased) }
placed = CIImage(cgImage: bc.makeImage()!)

let bgImg = CIImage(color: bg).cropped(to: frame)
let shadowSrc = placed.applyingFilter("CIColorMatrix", parameters: ["inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.35)])
let shadow = shadowSrc.transformed(by: CGAffineTransform(translationX: 0, y: -Double(H) * 0.02)).applyingFilter("CIGaussianBlur", parameters: ["inputRadius": Double(H) * 0.025]).cropped(to: frame)
let out = placed.composited(over: shadow.composited(over: bgImg)).cropped(to: frame)
let rep = NSBitmapImageRep(cgImage: ctx.createCGImage(out, from: frame)!)
try rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])!.write(to: URL(fileURLWithPath: outPath))
print("saved", outPath, Int(cw), "x", Int(ch), "→", W, "x", H)
