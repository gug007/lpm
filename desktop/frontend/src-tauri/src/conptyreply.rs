// ConPTY's startup handshake. portable-pty creates every pseudoconsole with
// PSEUDOCONSOLE_INHERIT_CURSOR, so conhost opens its output by asking the
// terminal where the cursor is (DSR CPR) and, on newer builds, what it is
// (DA1), and holds the shell's attach until it is answered: the inbox conhost
// forever, newer ones for a second. Nothing is there to answer that early — a
// service pane has no terminal, and a tab's xterm.js subscribes only once the
// terminal exists — so the reader answers the opening requests itself and
// keeps them out of the output. A late xterm.js answering too would hand
// conhost a second CPR, which it reads as an F3 keypress.
//
// Only the start of the stream is the handshake: once conhost has its cursor
// and real output begins, every query a program makes reaches the terminal.

use std::io::Write;
use std::sync::Mutex;

const ESC: u8 = 0x1b;
const CPR_REQUEST: &[u8] = b"\x1b[6n";
const DA1_REQUESTS: [&[u8]; 2] = [b"\x1b[c", b"\x1b[0c"];
/// Every pane and tab starts on a fresh screen.
const CPR_REPLY: &[u8] = b"\x1b[1;1R";
/// The answer xterm.js itself gives.
const DA1_REPLY: &[u8] = b"\x1b[?1;2c";
/// conhost asks before it draws anything; output this far in without a CPR
/// request means none is coming.
const WINDOW: usize = 16 * 1024;
/// An unfinished sequence longer than this is not one conhost sent.
const HELD_CAP: usize = 64;

#[derive(Default)]
pub struct Handshake {
    held: Vec<u8>,
    seen: usize,
    cpr: bool,
    da1: bool,
    over: bool,
}

enum Token {
    Csi(usize),
    Partial,
    Other,
}

fn token(bytes: &[u8]) -> Token {
    if bytes[0] != ESC {
        return Token::Other;
    }
    match bytes.get(1) {
        None => return Token::Partial,
        Some(b'[') => {}
        Some(_) => return Token::Other,
    }
    for (i, &b) in bytes.iter().enumerate().skip(2) {
        match b {
            0x20..=0x3f => {}
            0x40..=0x7e => return Token::Csi(i + 1),
            _ => return Token::Other,
        }
    }
    if bytes.len() > HELD_CAP {
        Token::Other
    } else {
        Token::Partial
    }
}

impl Handshake {
    /// Append to `output` what the terminal should see of `chunk`, and return
    /// the bytes conhost is waiting to read back (empty when it asked nothing).
    pub fn scan(&mut self, chunk: &[u8], output: &mut Vec<u8>) -> Vec<u8> {
        let mut reply = Vec::new();
        if self.over {
            output.extend_from_slice(chunk);
            return reply;
        }
        let mut bytes = std::mem::take(&mut self.held);
        bytes.extend_from_slice(chunk);
        let mut at = 0;
        while !self.over && at < bytes.len() {
            let rest = &bytes[at..];
            let len = match token(rest) {
                Token::Partial => {
                    self.held = rest.to_vec();
                    at = bytes.len();
                    break;
                }
                Token::Csi(len) => {
                    let seq = &rest[..len];
                    if !self.cpr && seq == CPR_REQUEST {
                        self.cpr = true;
                        reply.extend_from_slice(CPR_REPLY);
                    } else if !self.da1 && DA1_REQUESTS.contains(&seq) {
                        self.da1 = true;
                        reply.extend_from_slice(DA1_REPLY);
                    } else {
                        output.extend_from_slice(seq);
                    }
                    len
                }
                Token::Other if self.cpr => {
                    self.over = true;
                    break;
                }
                Token::Other => {
                    let len = rest[1..]
                        .iter()
                        .position(|&b| b == ESC)
                        .map_or(rest.len(), |p| p + 1);
                    output.extend_from_slice(&rest[..len]);
                    len
                }
            };
            at += len;
            self.seen += len;
            self.over = (self.cpr && self.da1) || (!self.cpr && self.seen > WINDOW);
        }
        output.extend_from_slice(&bytes[at..]);
        reply
    }

    /// What the terminal should see of `chunk`, once whatever conhost asked
    /// for has been answered on `writer`.
    pub fn answer(&mut self, chunk: &[u8], writer: &Mutex<Box<dyn Write + Send>>) -> Vec<u8> {
        let mut output = Vec::with_capacity(chunk.len());
        let reply = self.scan(chunk, &mut output);
        if !reply.is_empty() {
            let mut writer = writer.lock().unwrap();
            let _ = writer.write_all(&reply).and_then(|_| writer.flush());
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    const NEW_CONHOST: &[u8] = b"\x1b[6n\x1b[c\x1b[?1004h\x1b[?9001h";
    const OLD_CONHOST: &[u8] = b"\x1b[?9001h\x1b[6n";
    const PAINT: &[u8] = b"\x1b[?25l\x1b[2J\x1b[m\x1b[Huser@host MINGW64 ~\r\n$ ";

    fn feed(chunks: &[&[u8]]) -> (Handshake, Vec<u8>, Vec<u8>) {
        let mut hs = Handshake::default();
        let mut output = Vec::new();
        let mut reply = Vec::new();
        for chunk in chunks {
            reply.extend(hs.scan(chunk, &mut output));
        }
        (hs, output, reply)
    }

    fn concat(parts: &[&[u8]]) -> Vec<u8> {
        parts.concat()
    }

    #[test]
    fn answers_cpr_and_da1_and_forwards_the_rest() {
        let (hs, output, reply) = feed(&[NEW_CONHOST, PAINT]);
        assert_eq!(reply, concat(&[CPR_REPLY, DA1_REPLY]));
        assert_eq!(output, concat(&[b"\x1b[?1004h\x1b[?9001h", PAINT]));
        assert!(hs.over);
    }

    #[test]
    fn answers_the_inbox_conhost_which_asks_only_for_the_cursor() {
        let (mut hs, mut output, reply) = feed(&[OLD_CONHOST]);
        assert_eq!(reply, CPR_REPLY);
        assert_eq!(output, b"\x1b[?9001h");
        assert!(hs.scan(PAINT, &mut output).is_empty());
        assert!(hs.over);
        assert!(hs.scan(b"\x1b[c\x1b[6n", &mut output).is_empty());
        assert_eq!(output, concat(&[b"\x1b[?9001h", PAINT, b"\x1b[c\x1b[6n"]));
    }

    #[test]
    fn a_request_split_at_any_byte_is_still_answered() {
        let stream = concat(&[NEW_CONHOST, PAINT]);
        let (_, whole_output, whole_reply) = feed(&[&stream]);
        for cut in 1..stream.len() {
            let (_, output, reply) = feed(&[&stream[..cut], &stream[cut..]]);
            assert_eq!(reply, whole_reply, "cut at {cut}");
            assert_eq!(output, whole_output, "cut at {cut}");
        }
        let bytes: Vec<&[u8]> = stream.chunks(1).collect();
        let (_, output, reply) = feed(&bytes);
        assert_eq!(reply, whole_reply);
        assert_eq!(output, whole_output);
    }

    #[test]
    fn the_cursor_reply_goes_out_before_the_rest_of_the_stream_arrives() {
        let mut hs = Handshake::default();
        let mut output = Vec::new();
        assert_eq!(hs.scan(b"\x1b[6n", &mut output), CPR_REPLY);
        assert!(output.is_empty());
        assert!(!hs.over);
    }

    #[test]
    fn queries_after_the_handshake_reach_the_terminal() {
        let later = b"\x1b[6n\x1b[c\x1b[0c";
        let (_, output, reply) = feed(&[NEW_CONHOST, PAINT, later]);
        assert_eq!(reply, concat(&[CPR_REPLY, DA1_REPLY]));
        assert!(output.ends_with(later));
    }

    #[test]
    fn answers_only_the_first_of_each_request() {
        let (_, output, reply) = feed(&[b"\x1b[6n\x1b[6n\x1b[0c\x1b[c"]);
        assert_eq!(reply, concat(&[CPR_REPLY, DA1_REPLY]));
        assert_eq!(output, b"\x1b[6n\x1b[c");
    }

    #[test]
    fn output_ahead_of_the_request_does_not_hide_it() {
        let (_, output, reply) = feed(&[b"\x1b]0;bash\x07ready", OLD_CONHOST]);
        assert_eq!(reply, CPR_REPLY);
        assert_eq!(output, b"\x1b]0;bash\x07ready\x1b[?9001h");
    }

    #[test]
    fn other_queries_are_left_for_the_terminal() {
        let (_, output, reply) = feed(&[b"\x1b[>c\x1b[5n\x1b[6n"]);
        assert_eq!(reply, CPR_REPLY);
        assert_eq!(output, b"\x1b[>c\x1b[5n");
    }

    #[test]
    fn gives_up_when_no_request_opens_the_stream() {
        let filler = vec![b'x'; WINDOW + 1];
        let (hs, output, reply) = feed(&[&filler, b"\x1b[6n"]);
        assert!(hs.over);
        assert!(reply.is_empty());
        assert!(output.ends_with(b"\x1b[6n"));
    }

    #[test]
    fn an_unfinished_sequence_is_held_only_so_long() {
        let long = concat(&[b"\x1b[", &[b'1'; HELD_CAP]]);
        let (hs, output, reply) = feed(&[&long]);
        assert!(reply.is_empty());
        assert_eq!(output, long);
        assert!(hs.held.is_empty());
    }

    struct Sink(Arc<Mutex<Vec<u8>>>);

    impl Write for Sink {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn answer_writes_the_reply_back_and_returns_the_rest() {
        let typed = Arc::new(Mutex::new(Vec::new()));
        let writer: Mutex<Box<dyn Write + Send>> = Mutex::new(Box::new(Sink(typed.clone())));
        let mut hs = Handshake::default();
        let output = hs.answer(&concat(&[NEW_CONHOST, PAINT]), &writer);
        assert_eq!(*typed.lock().unwrap(), concat(&[CPR_REPLY, DA1_REPLY]));
        assert_eq!(output, concat(&[b"\x1b[?1004h\x1b[?9001h", PAINT]));
        assert_eq!(hs.answer(b"\x1b[6n", &writer), b"\x1b[6n");
        assert_eq!(*typed.lock().unwrap(), concat(&[CPR_REPLY, DA1_REPLY]));
    }
}
