// A transcript of `text`, a word every `stepMs`.
module.exports = (text, stepMs = 300) => text.split(" ").map((word, i) => ({ word, start: (i * stepMs) / 1000, end: (i * stepMs + 250) / 1000 }));
