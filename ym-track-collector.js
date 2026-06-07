(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const tracks = new Map();

  const clean = str =>
    String(str || '')
      .replace(/\s+/g, ' ')
      .trim();

  const getTrackIdFromHref = href => {
    const match = String(href || '').match(/\/track\/(\d+)/);
    return match ? match[1] : null;
  };

  const getScrollableElement = () => {
    const candidates = [
      document.querySelector('[data-virtuoso-scroller="true"]'),
      document.querySelector('[class*="PageLayout_content"]'),
      document.querySelector('[class*="page"]'),
      document.scrollingElement,
      document.documentElement
    ].filter(Boolean);

    return candidates.find(el => el.scrollHeight > el.clientHeight) || document.scrollingElement;
  };

  const findTrackRoot = link => {
    return (
      link.closest('[data-intersection-property-id]') ||
      link.closest('[class*="Track"]') ||
      link.closest('[class*="track"]') ||
      link.closest('[class*="Playlist"]') ||
      link.closest('li') ||
      link.closest('div')
    );
  };

  const collectVisibleTracks = () => {
    const trackLinks = Array.from(document.querySelectorAll('a[href*="/track/"]'));

    for (const link of trackLinks) {
      const href = link.getAttribute('href') || '';
      const id = getTrackIdFromHref(href);

      if (!id || tracks.has(id)) continue;

      const title = clean(link.textContent);
      if (!title) continue;

      const root = findTrackRoot(link);
      if (!root) continue;

      const artistLinks = Array.from(root.querySelectorAll('a[href*="/artist/"]'));

      const artists = artistLinks
        .map(a => clean(a.textContent))
        .filter(Boolean)
        .filter((name, index, arr) => arr.indexOf(name) === index)
        .join(', ');

      if (!artists) {
        continue;
      }

      tracks.set(id, {
        id,
        title,
        artists
      });
    }

    return tracks.size;
  };

  const downloadTxt = () => {
    const lines = Array.from(tracks.values()).map(track => {
      return `${track.artists} - ${track.title}`;
    });

    const text = lines.join('\n');

    const blob = new Blob([text], {
      type: 'text/plain;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const playlistTitle =
      clean(document.querySelector('h1')?.textContent) ||
      'yandex-music-playlist';

    a.href = url;
    a.download = `${playlistTitle}.txt`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const makePanel = () => {
    const oldPanel = document.getElementById('ym-export-panel');
    if (oldPanel) oldPanel.remove();

    const style = document.createElement('style');
    style.id = 'ym-export-panel-style';
    style.textContent = `
      #ym-export-panel {
        position: fixed;
        right: 24px;
        top: 24px;
        z-index: 999999;
        width: 300px;
        padding: 18px;
        box-sizing: border-box;
        background: #111;
        color: #eee;
        border: 1px solid #333;
        border-radius: 14px;
        font-family: Arial, sans-serif;
        box-shadow: 0 10px 40px rgba(0,0,0,.45);
      }

      #ym-export-panel-title {
        font-size: 13px;
        opacity: .6;
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: .08em;
      }

      #ym-export-count {
        font-size: 38px;
        line-height: 1;
        margin-bottom: 8px;
      }

      #ym-export-status {
        font-size: 13px;
        color: #aaa;
        min-height: 18px;
        margin-bottom: 14px;
      }

      #ym-export-panel button {
        width: 100%;
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #444;
        background: transparent;
        color: #eee;
        cursor: pointer;
        text-align: left;
        font-size: 13px;
      }

      #ym-export-panel button:hover {
        background: #222;
      }

      #ym-export-panel button.primary {
        border-color: #c8f560;
        color: #c8f560;
      }
    `;

    if (!document.getElementById('ym-export-panel-style')) {
      document.head.appendChild(style);
    }

    const panel = document.createElement('div');
    panel.id = 'ym-export-panel';

    panel.innerHTML = `
      <div id="ym-export-panel-title">Yandex Music TXT Export</div>
      <div id="ym-export-count">0</div>
      <div id="ym-export-status">Готов к сбору треков</div>
      <button class="primary" id="ym-auto-scan">Собрать весь плейлист и скачать TXT</button>
      <button id="ym-visible-scan">Собрать видимые треки</button>
      <button id="ym-download">Скачать TXT</button>
      <button id="ym-close">Закрыть</button>
    `;

    document.body.appendChild(panel);

    return panel;
  };

  const updatePanel = status => {
    const count = document.getElementById('ym-export-count');
    const statusEl = document.getElementById('ym-export-status');

    if (count) count.textContent = tracks.size;
    if (statusEl) statusEl.textContent = status || '';
  };

  const autoScan = async () => {
    const scroller = getScrollableElement();

    let stableRounds = 0;
    let lastCount = -1;
    let lastScrollTop = -1;

    updatePanel('Собираю треки...');

    collectVisibleTracks();
    updatePanel(`Найдено: ${tracks.size}`);

    while (stableRounds < 8) {
      collectVisibleTracks();

      if (tracks.size === lastCount && scroller.scrollTop === lastScrollTop) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }

      lastCount = tracks.size;
      lastScrollTop = scroller.scrollTop;

      updatePanel(`Найдено: ${tracks.size}. Прокручиваю список...`);

      scroller.scrollTop += Math.max(500, Math.floor(scroller.clientHeight * 0.85));

      window.dispatchEvent(new Event('scroll'));
      scroller.dispatchEvent(new Event('scroll'));

      await sleep(450);
    }

    collectVisibleTracks();

    updatePanel(`Готово. Треков: ${tracks.size}`);

    if (tracks.size > 0) {
      downloadTxt();
    } else {
      updatePanel('Треки не найдены. Открой страницу плейлиста и попробуй ещё раз.');
    }
  };

  makePanel();

  document.getElementById('ym-auto-scan').onclick = autoScan;

  document.getElementById('ym-visible-scan').onclick = () => {
    collectVisibleTracks();
    updatePanel(`Собрано видимых треков: ${tracks.size}`);
  };

  document.getElementById('ym-download').onclick = () => {
    collectVisibleTracks();

    if (tracks.size > 0) {
      downloadTxt();
      updatePanel(`Скачано треков: ${tracks.size}`);
    } else {
      updatePanel('Нет треков для скачивания');
    }
  };

  document.getElementById('ym-close').onclick = () => {
    document.getElementById('ym-export-panel')?.remove();
  };

  collectVisibleTracks();
  updatePanel(`Найдено видимых треков: ${tracks.size}`);
})();
