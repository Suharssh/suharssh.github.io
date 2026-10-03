// The terminal is a layer over the page: every command reads from or moves around
// the existing HTML. No content lives here.
const $ = (s) => document.querySelector(s);
const input = $('#cmd');
const out = $('#out');
const root = document.documentElement;

// everything is read from the HTML, so adding an artist or a track needs no JS edit
const PANELS = [...document.querySelectorAll('[data-panel]')];
const ARTISTS = [...new Set(PANELS.map((p) => p.dataset.panel))];
const SECTIONS = [...document.querySelectorAll('main > section[id]')].map((s) => s.id);
const TRACKS = [...document.querySelectorAll('.track')].map((t) => t.id);
const ALIASES = { contact: 'liner-notes', home: 'about', '~': 'about', '..': 'about', '': 'about' };

function print(text, cls) {
    const p = document.createElement('p');
    p.textContent = text;
    if (cls) p.className = cls;
    out.append(p);
    out.scrollTop = out.scrollHeight;
}

const cmds = {
    help: () => print('commands: ' + Object.keys(cmds).join('  ') + '\ntab completes, ↑/↓ for history'),
    ls: () => print('sections: ' + SECTIONS.join('  ') + '\ntracks:   ' + TRACKS.join('  ') + '\nartists:  ' + ARTISTS.join('  ')),
    cd: (arg = '') => {
        const id = ALIASES[arg] ?? arg.replace(/^[#/]/, '');
        const el = document.getElementById(id);
        if (el) el.scrollIntoView();
        else print(`cd: no such section: ${arg}. try ls`);
    },
    cat: (arg = '') => {
        const el = document.getElementById(arg);
        if (!el?.classList.contains('track')) return print(`cat: ${arg || '?'}: not on the tracklist. try ls`);
        el.querySelector('details').open = true;
        el.scrollIntoView();
        print('▶ ' + el.querySelector('h3').textContent);
    },
    // the theme follows scroll, so "playing" an artist means going to their section
    play: (arg = '') => {
        if (!ARTISTS.includes(arg)) return print('artists: ' + ARTISTS.join('  '));
        PANELS.find((p) => p.dataset.panel === arg).scrollIntoView();
    },
    whoami: () => print('suharssh: ' + $('.tagline').textContent),
    contact: () => cmds.cd('contact'),
    clear: () => out.replaceChildren(),
};

function run(line) {
    line = line.trim().toLowerCase();
    if (!line) return;
    print('$ ' + line, 'echo');
    const [name, ...args] = line.split(/\s+/);
    if (cmds[name]) cmds[name](args.join(' '));
    else print(`${name}: command not found. that's a skit, not a track. try help`);
}

// tab completion: first word completes commands, second word completes that command's args
const ARGS = { cd: SECTIONS, cat: TRACKS, play: ARTISTS };
function complete(value) {
    const parts = value.trimStart().split(/\s+/);
    const pool = parts.length === 1 ? Object.keys(cmds) : ARGS[parts[0]] || [];
    const hits = pool.filter((x) => x.startsWith(parts.at(-1)));
    if (hits.length === 1) {
        parts[parts.length - 1] = hits[0];
        return parts.join(' ') + (parts.length === 1 && ARGS[hits[0]] ? ' ' : '');
    }
    if (hits.length > 1) print(hits.join('  '));
    return value;
}

const history = [];
let h = 0;

$('#cli').addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) h = history.push(input.value);
    run(input.value);
    input.value = '';
});

input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && input.value) { // empty input: let Tab move focus normally
        e.preventDefault();
        input.value = complete(input.value);
    } else if (e.key === 'ArrowUp' && h > 0) {
        e.preventDefault();
        input.value = history[--h];
    } else if (e.key === 'ArrowDown' && h < history.length) {
        e.preventDefault();
        input.value = history[++h] ?? '';
    }
});

// chips: run the command so it echoes in the terminal (links still work if this never loads)
$('.chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cmd]');
    if (!chip) return;
    e.preventDefault();
    run(chip.dataset.cmd);
});

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// kinetic headings: wrap each letter so CSS can stagger them in.
// Screen readers get the whole word via aria-label instead of letter-by-letter spans.
document.querySelectorAll('h2').forEach((h) => {
    const words = h.textContent.split(' ');
    let i = 0;
    h.setAttribute('aria-label', h.textContent);
    h.replaceChildren();
    words.forEach((w, wi) => {
        const word = document.createElement('span');
        word.className = 'w';
        word.setAttribute('aria-hidden', 'true');
        for (const c of w) {
            const letter = document.createElement('span');
            letter.textContent = c;
            letter.style.setProperty('--i', i++);
            word.append(letter);
        }
        h.append(word, wi < words.length - 1 ? ' ' : '');
    });
});
document.querySelectorAll('.track').forEach((t, i) => t.style.setProperty('--i', i)); // cascade order

// now playing: whichever panel crosses the middle of the screen sets the era (the terminal follows it)
const np = $('#np');
const npLine = $('.np');
const vinyl = $('.vinyl');
const nowPlaying = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    const p = en.target;
    np.textContent = `${p.dataset.album} · ${p.dataset.artist}`;
    if (root.dataset.era === p.dataset.panel) return;
    root.dataset.era = p.dataset.panel;
    // needle drop: the record pops back in when a new artist comes on
    if (!reduce) vinyl.animate(
        [{ transform: 'scale(0.3)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 450, easing: 'cubic-bezier(.3, 1.6, .5, 1)', composite: 'add' },
    );
}), { rootMargin: '-50% 0px -50% 0px' });
PANELS.forEach((p) => nowPlaying.observe(p));

// track progress: scroll position as a 3:45 song
const bar = $('.bar span');
const time = $('#time');
const LENGTH = 225;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let ticking = false;
function progress() {
    ticking = false;
    const max = root.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    bar.style.setProperty('--p', p);
    time.textContent = `${fmt(p * LENGTH)} / ${fmt(LENGTH)}`;
    if (!reduce) npLine.style.setProperty('--scratch', Math.round(scrollY * 0.3)); // scrolling scratches the small record
}
addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(progress); } // at most once per frame
}, { passive: true });
addEventListener('resize', progress);
progress();

// reveal sections once as they scroll in
const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}), { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// boot line: types itself out while the hero name writes in (CSS)
(function boot() {
    const line = '$ ./play --album suharssh';
    if (reduce) return print('type help for commands, or tap a section below');
    const p = document.createElement('p');
    p.className = 'echo';
    out.append(p);
    let n = 0;
    (function tick() {
        p.textContent = line.slice(0, ++n);
        if (n < line.length) setTimeout(tick, 30);
        else setTimeout(() => print('type help for commands, or tap a section below'), 250);
    })();
})();
