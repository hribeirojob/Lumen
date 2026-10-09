import SwiftUI

/// Escala roxa Lumen — fonte unica: nota `palette-lumen`.
/// Mac, PWA e icone usam ESTA escala. Nao adicionar tom fora dela.
///
/// Roxo saturado (`accent`, `accentHi`) e PONTUAL: interativo, selecao, foco,
/// glow. As superficies grandes ficam nos tons escuros (`page`, `surface`).
enum LumenTheme {
  /// surface-2 #3A0B4F — canvas do app, elevacao.
  static let canvas = Color(red: 0.227, green: 0.043, blue: 0.310)
  /// ground #140720 — chao da pagina.
  static let page = Color(red: 0.078, green: 0.027, blue: 0.125)
  /// accent #8F3DAF — interativo primario, selecao.
  static let selection = Color(red: 0.561, green: 0.239, blue: 0.686)

  /// surface #240E33 — cartao, painel; base dessaturada sob Liquid Glass.
  static let surface = Color(red: 0.141, green: 0.055, blue: 0.200)
  /// elevated #501669 — hover de superficie, borda forte.
  static let elevated = Color(red: 0.314, green: 0.086, blue: 0.412)
  /// line #70288E — divisor (usar com alpha 0.4–0.6).
  static let line = Color(red: 0.439, green: 0.157, blue: 0.557)
  /// accent-hi #AD56D3 — hover/ativo, glow, foco.
  static let accentHi = Color(red: 0.678, green: 0.337, blue: 0.827)
  /// text #F3E9F9 — texto principal (13.3:1 sobre canvas).
  static let text = Color(red: 0.953, green: 0.914, blue: 0.976)
  /// text-dim #C0A8CE — texto secundario (7.3:1 sobre canvas).
  static let textDim = Color(red: 0.753, green: 0.659, blue: 0.808)
}
