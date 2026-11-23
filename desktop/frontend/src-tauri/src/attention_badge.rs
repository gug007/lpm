// How many agents wait on an answer, on the app's icon: the Dock badge on macOS,
// an overlay on the Windows taskbar button, and the launcher count on Linux
// desktops that have Unity's launcher API (the rest show nothing).
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static SHOWN: Mutex<u32> = Mutex::new(0);

#[tauri::command(async)]
pub fn set_attention_badge(app: AppHandle, count: u32) -> Result<(), String> {
    if crate::sys::headless() {
        return Ok(());
    }
    let mut shown = SHOWN.lock().unwrap_or_else(|e| e.into_inner());
    if *shown == count {
        return Ok(());
    }
    let win = app.get_window("main").ok_or("main window not found")?;
    show(&win, count).map_err(|e| e.to_string())?;
    *shown = count;
    Ok(())
}

#[cfg(not(windows))]
fn show(win: &tauri::Window, count: u32) -> tauri::Result<()> {
    win.set_badge_count((count > 0).then_some(i64::from(count)))
}

#[cfg(windows)]
fn show(win: &tauri::Window, count: u32) -> tauri::Result<()> {
    let icon = (count > 0)
        .then(|| tauri::image::Image::new_owned(overlay_pixels(count), OVERLAY_SIZE, OVERLAY_SIZE));
    win.set_overlay_icon(icon)
}

#[cfg(any(windows, test))]
const OVERLAY_SIZE: u32 = 32;

#[cfg(any(windows, test))]
const FILL: [u8; 3] = [0xF5, 0x9E, 0x0B];

#[cfg(any(windows, test))]
const INK: [u8; 3] = [0x1A, 0x1A, 0x1A];

// 5×7 glyphs for 0–9 and "+": a byte per row, its low five bits left to right.
#[cfg(any(windows, test))]
const GLYPHS: [[u8; 7]; 11] = [
    [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
    [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
    [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
    [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
    [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
    [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00],
];

#[cfg(any(windows, test))]
const PLUS: usize = 10;

/// RGBA pixels of an amber disc with the count on it; past 9 it reads "9+".
#[cfg(any(windows, test))]
fn overlay_pixels(count: u32) -> Vec<u8> {
    let size = OVERLAY_SIZE as usize;
    let mut rgba = vec![0u8; size * size * 4];
    let center = size as f32 / 2.0;
    let radius = center - 0.5;
    const SUB: usize = 4;
    for y in 0..size {
        for x in 0..size {
            let mut inside = 0;
            for sy in 0..SUB {
                for sx in 0..SUB {
                    let dx = x as f32 + (sx as f32 + 0.5) / SUB as f32 - center;
                    let dy = y as f32 + (sy as f32 + 0.5) / SUB as f32 - center;
                    if dx * dx + dy * dy <= radius * radius {
                        inside += 1;
                    }
                }
            }
            if inside > 0 {
                let i = (y * size + x) * 4;
                rgba[i..i + 3].copy_from_slice(&FILL);
                rgba[i + 3] = (inside * 255 / (SUB * SUB)) as u8;
            }
        }
    }
    let (glyphs, scale): (Vec<usize>, usize) = if count < 10 {
        (vec![count as usize], 3)
    } else {
        (vec![9, PLUS], 2)
    };
    let width = glyphs.len() * 5 * scale + (glyphs.len() - 1) * scale;
    let (left, top) = ((size - width) / 2, (size - 7 * scale) / 2);
    for (n, glyph) in glyphs.iter().enumerate() {
        let origin = left + n * 6 * scale;
        for (row, bits) in GLYPHS[*glyph].iter().enumerate() {
            for col in 0..5 {
                if bits & (0x10 >> col) == 0 {
                    continue;
                }
                for py in 0..scale {
                    for px in 0..scale {
                        let i = ((top + row * scale + py) * size + origin + col * scale + px) * 4;
                        rgba[i..i + 3].copy_from_slice(&INK);
                        rgba[i + 3] = 255;
                    }
                }
            }
        }
    }
    rgba
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alpha(rgba: &[u8], x: usize, y: usize) -> u8 {
        rgba[(y * OVERLAY_SIZE as usize + x) * 4 + 3]
    }

    fn inked(rgba: &[u8]) -> usize {
        rgba.chunks(4).filter(|p| p[..3] == INK && p[3] == 255).count()
    }

    #[test]
    fn the_overlay_is_a_disc_with_clear_corners() {
        let rgba = overlay_pixels(3);
        assert_eq!(rgba.len(), (OVERLAY_SIZE * OVERLAY_SIZE * 4) as usize);
        let last = OVERLAY_SIZE as usize - 1;
        for (x, y) in [(0, 0), (last, 0), (0, last), (last, last)] {
            assert_eq!(alpha(&rgba, x, y), 0);
        }
        assert_eq!(alpha(&rgba, 16, 1), 255);
    }

    #[test]
    fn each_count_draws_its_digit() {
        let drawn: Vec<Vec<u8>> = (1..=9).map(overlay_pixels).collect();
        for (i, a) in drawn.iter().enumerate() {
            assert!(inked(a) > 0);
            for b in &drawn[i + 1..] {
                assert_ne!(a, b);
            }
        }
    }

    #[test]
    fn past_nine_it_reads_nine_plus() {
        assert_eq!(overlay_pixels(10), overlay_pixels(42));
        assert_ne!(overlay_pixels(10), overlay_pixels(9));
    }

    #[test]
    fn digits_stay_on_the_disc() {
        let size = OVERLAY_SIZE as usize;
        let center = size as f32 / 2.0;
        for count in [1, 4, 8, 12] {
            let rgba = overlay_pixels(count);
            for (i, px) in rgba.chunks(4).enumerate() {
                if px[..3] != INK {
                    continue;
                }
                let (x, y) = ((i % size) as f32 + 0.5, (i / size) as f32 + 0.5);
                let distance = ((x - center).powi(2) + (y - center).powi(2)).sqrt();
                assert!(distance < center - 2.0, "count {count} inks ({x}, {y}) off the disc");
            }
        }
    }
}
