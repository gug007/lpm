import SwiftUI

/// "My agents' week" or month, the desktop's WeeklyRecapCard in its default theme, laid
/// out 600 design units wide. Shown scaled to fit (`RecapCardFit`) and drawn into
/// the shared image unscaled; nothing on it names a project.
struct WeeklyRecapCard: View {
    private typealias S = RecapCardStyle

    let card: RecapCardModel
    /// Off for the shared image: the card's rectangle without the rounded frame,
    /// as the desktop draws its image.
    var framed = true

    var body: some View {
        VStack(alignment: .leading, spacing: S.gap) {
            header
            hero
            tiles
            if !card.mix.isEmpty {
                Text(card.mixText)
                    .font(.system(size: S.rowSize))
                    .foregroundStyle(S.soft)
                    .lineLimit(1)
                    .frame(height: S.rowLine)
            }
            RecapMark()
                .frame(maxWidth: .infinity, alignment: .trailing)
                .frame(height: S.footerLine)
        }
        .padding(EdgeInsets(top: S.padTop, leading: S.padX, bottom: S.padBottom, trailing: S.padX))
        .frame(width: S.width, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .background(RecapGlow())
        .clipShape(RoundedRectangle(cornerRadius: framed ? S.radius : 0, style: .continuous))
        .overlay {
            if framed {
                RoundedRectangle(cornerRadius: S.radius, style: .continuous).strokeBorder(S.border, lineWidth: 1)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text(card.title)
                .font(.system(size: S.titleSize, weight: .bold))
                .foregroundStyle(S.text)
            Spacer(minLength: 0)
            Text(card.range)
                .font(.system(size: S.bodySize))
                .foregroundStyle(S.muted)
        }
        .lineLimit(1)
        .frame(height: S.headerLine)
    }

    /// The tokens lead and the hours follow, each over its label; without
    /// tokens, the hours and what they mean share a line when they fit.
    @ViewBuilder
    private var hero: some View {
        if let tokens = card.tokens {
            stacked(tokens, S.tokensLabel, size: S.heroSize)
            stacked(card.hours, S.hoursLabel, size: S.hoursSize)
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    bigNumber(card.hours, size: S.heroSize)
                    label(S.hoursLabel)
                }
                VStack(alignment: .leading, spacing: 0) {
                    bigNumber(card.hours, size: S.heroSize)
                    label(S.hoursLabel)
                }
            }
        }
    }

    private func stacked(_ value: String, _ text: String, size: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: S.stackGap) {
            bigNumber(value, size: size)
            label(text).frame(height: S.labelLine)
        }
    }

    private func bigNumber(_ value: String, size: CGFloat) -> some View {
        Text(value)
            .font(.system(size: size, weight: .heavy))
            .tracking(size * S.heroTracking)
            .foregroundStyle(S.strong)
            .fixedSize()
            .frame(height: size)
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.system(size: S.bodySize))
            .foregroundStyle(S.soft)
            .fixedSize()
    }

    private var tiles: some View {
        HStack(spacing: S.tileGap) {
            ForEach(card.tiles, id: \.id) { tile in
                tileBox {
                    Text(tile.value)
                        .font(.system(size: 24, weight: .heavy))
                        .monospacedDigit()
                        .foregroundStyle(S.strong)
                        .frame(height: S.tileValueLine)
                    tileLabel(Text(tile.label).foregroundColor(S.muted))
                }
            }
            tileBox {
                Text(card.linesAdded)
                    .font(.system(size: 20, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(S.green)
                    .frame(height: S.tileValueLine)
                tileLabel(Text(card.linesRemoved).foregroundColor(S.red) + Text(" lines").foregroundColor(S.muted))
            }
        }
    }

    private func tileBox<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .lineLimit(1)
            .padding(.horizontal, S.tilePadX + 1)
            .padding(.vertical, S.tilePadY + 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(S.tile, in: RoundedRectangle(cornerRadius: S.tileRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: S.tileRadius, style: .continuous).strokeBorder(S.border, lineWidth: 1))
    }

    private func tileLabel(_ text: Text) -> some View {
        text.font(.system(size: 13)).frame(height: S.tileLabelLine)
    }
}

/// The card's green glow, drawn as CSS draws `linear-gradient(150deg, …)`: a
/// line through the middle at that angle, just long enough to reach the corners.
private struct RecapGlow: View {
    private typealias S = RecapCardStyle

    var body: some View {
        GeometryReader { geo in
            let w = max(1, geo.size.width)
            let h = max(1, geo.size.height)
            let angle = S.glowDegrees * .pi / 180
            let dx = sin(angle)
            let dy = -cos(angle)
            let length = abs(w * dx) + abs(h * dy)
            LinearGradient(
                stops: [.init(color: S.glow, location: 0), .init(color: S.ground, location: 0.55)],
                startPoint: UnitPoint(x: 0.5 - dx * length / (2 * w), y: 0.5 - dy * length / (2 * h)),
                endPoint: UnitPoint(x: 0.5 + dx * length / (2 * w), y: 0.5 + dy * length / (2 * h))
            )
        }
    }
}
