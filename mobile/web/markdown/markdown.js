// A Markdown file rendered the way the desktop's Files preview renders it:
// GitHub-flavoured Markdown with its inline HTML (centred blocks, badges, sized
// images, <details>), sanitized so a README shows as it does on GitHub without
// running anything. Links and images that name files are handed to the app,
// which reads them from the Mac.
(function () {
  const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
  const LOCAL_SCHEME = 'lpm-file://image?src=';
  const SANITIZE = { FORBID_TAGS: ['style', 'form'], FORBID_ATTR: ['style'] };

  hljs.configure({ ignoreUnescapedHTML: true });

  function post(name, body) {
    window.webkit.messageHandlers[name].postMessage(body);
  }

  function isLocal(url) {
    return !!url && !SCHEME_RE.test(url) && !url.startsWith('//') && !url.startsWith('#');
  }

  function localize(url) {
    return isLocal(url) ? LOCAL_SCHEME + encodeURIComponent(url) : url;
  }

  function localizeImages(root) {
    root.querySelectorAll('img[src]').forEach((img) => {
      img.setAttribute('src', localize(img.getAttribute('src')));
    });
    root.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
      const set = el
        .getAttribute('srcset')
        .split(',')
        .map((entry) => {
          const [url, ...descriptor] = entry.trim().split(/\s+/);
          return [localize(url), ...descriptor].join(' ');
        });
      el.setAttribute('srcset', set.join(', '));
    });
  }

  // A file the Mac can't send shows as its alt text, as on the desktop.
  function showMissing(e) {
    const img = e.target;
    const url = img instanceof HTMLImageElement ? img.getAttribute('src') || '' : '';
    if (!url.startsWith(LOCAL_SCHEME)) return;
    const src = decodeURIComponent(url.slice(LOCAL_SCHEME.length));
    const label = document.createElement('span');
    label.className = 'missing-image';
    label.textContent = img.alt || src.split('/').pop();
    img.replaceWith(label);
  }

  // GitHub's heading ids, so a README's own table of contents works.
  function anchorHeadings(root) {
    const seen = new Map();
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (h.id) return;
      const base = h.textContent
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      h.id = n ? `${base}-${n}` : base;
    });
  }

  function highlightCode(root) {
    root.querySelectorAll('pre > code').forEach((code) => {
      const lang = (/(?:^|\s)language-(\S+)/.exec(code.className) || [])[1];
      if (!lang) return;
      if (hljs.getLanguage(lang)) hljs.highlightElement(code);
      const pre = code.parentElement;
      const block = document.createElement('div');
      block.className = 'code-block';
      const header = document.createElement('header');
      const label = document.createElement('span');
      label.textContent = lang;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => {
        post('copy', code.textContent.replace(/\n$/, ''));
        copy.textContent = 'Copied';
        copy.classList.add('copied');
        setTimeout(() => {
          copy.textContent = 'Copy';
          copy.classList.remove('copied');
        }, 1500);
      });
      header.append(label, copy);
      pre.replaceWith(block);
      block.append(header, pre);
    });
  }

  function scrollToAnchor(fragment) {
    let id = fragment;
    try {
      id = decodeURIComponent(fragment);
    } catch (_) {}
    if (!id || id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = document.getElementById(id) || document.getElementsByName(id)[0];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('error', showMissing, true);

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute('href');
    if (href.startsWith('#')) scrollToAnchor(href.slice(1));
    else post('link', href);
  });

  window.renderMarkdown = function (text) {
    const doc = document.getElementById('doc');
    doc.innerHTML = DOMPurify.sanitize(marked.parse(text, { gfm: true }), SANITIZE);
    localizeImages(doc);
    anchorHeadings(doc);
    highlightCode(doc);
  };
})();
