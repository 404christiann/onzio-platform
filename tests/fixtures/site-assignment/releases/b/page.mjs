import { createElement as h } from 'react';
import { heading, revision } from './bindings.mjs';
export { revision };
export function Page({ hero, assets }) {
  return h('main', { className: 'alpha-b', 'data-release': 'b' },
    h('header', null, h('img', { src: `${assets}/badge.png`, alt: 'Alpha badge', width: 48, height: 48 }), h('p', null, 'Alpha club site B')),
    h('h1', null, heading(hero)), h('p', { id: 'intro', 'data-intro': '' }, hero.intro),
    h('a', { href: '#intro' }, 'Read the club update'));
}
