import crypto from 'crypto';
import React from 'react';
import type { IterableScript, Primitve, Nullable } from './types';

export const integritySha256 = (inlineScriptCode: string) => {
  const hash = crypto.createHash('sha256');
  hash.update(inlineScriptCode);
  return `sha256-${hash.digest('base64')}`;
};

const getScriptValue = (attr: string, attrs: IterableScript) =>
  attrs.find(([a]) => attr === a)?.[1];

const quoteIfString = (value: Primitve) =>
  typeof value === 'string' ? `'${value}'` : value;

// the attributes the can be set in plain string JS hacking
const isKnownScriptAttr = (attr: string) =>
  [
    'id',
    'src',
    'integrity',
    'async',
    'defer',
    'noModule',
    'crossOrigin',
    'nonce',
  ].includes(attr);

export const isScriptElement = (el: any): el is JSX.Element =>
  el && el.type === 'script';

const iterableScriptFromProps = (el: Nullable<JSX.Element>): IterableScript => {
  if (!isScriptElement(el)) return [];
  return Object.entries<Primitve>(el.props).filter(
    ([, value]) =>
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
  );
};

// create a inline script loader (plain string JS code) to load a batch of scripts non-parser inserted.
// wrap in IIFE to avoid naming collisions in global window scope.
export const createHashableScriptLoader = (
  scripts: IterableScript[],
  id: string
) => {
  return scripts.length > 0
    ? `(function () { ${scripts
        .map(
          (attrs, i) => `
  var s${i} = document.createElement('script');
  ${attrs
    ?.map(([attr, value]) =>
      isKnownScriptAttr(attr)
        ? `s${i}.${attr}=${quoteIfString(value)}`
        : `s${i}.setAttribute('${attr}', '${value}')`
    )
    .join(';')}`
        )
        .join(';')};
  var s = [${scripts.map((s, i) => `s${i}`).join(',')}];
  var p = document.getElementById('${id}').parentNode;
  s.forEach(function(si) {
    p.appendChild(si);
  });
})()
`
    : '';
};

// load a batch of script elements without integrity via a trusted proxy loader element with integrity
// can be used, when for some reason the correct final integrity of a script element can't be obtained at build time.
export const createTrustedLoadingProxy = (els: JSX.Element[]) => {
  const iterableScripts = els.map(iterableScriptFromProps);
  const proxy = createHashableScriptLoader(
    iterableScripts,
    'self-reference-proxy'
  );
  const id = integritySha256(proxy);
  const inlineCode = proxy.replace(/self-reference-proxy/g, id);
  const async = iterableScripts.every((s) => !!getScriptValue('async', s));
  const defer = iterableScripts.every((s) => !!getScriptValue('defer', s));
  return (
    <script id={id} async={async || undefined} defer={defer || undefined}>
      {inlineCode}
    </script>
  );
};

// create a script element from inline code with its hash as integrity
// a script element is interpreted to be a inline script if it has a single child of type string
export const withHashIfInlineScript = (s: JSX.Element) => {
  if(!isScriptElement(s) || typeof s.props.children !== 'string') {
    return s;
  }
  const { children: inlineScriptCode, ...props } = s.props;
  const integrity = integritySha256(inlineScriptCode);
  return (
    // eslint-disable-next-line @next/next/no-sync-scripts
    <script
      key={s.key}
      {...props}
      src={null}
      integrity={integrity}
      dangerouslySetInnerHTML={{ __html: inlineScriptCode }}
    />
  );
};

export const scriptWithPatchedCrossOrigin = (s: JSX.Element) => {
  if(!isScriptElement(s) || !(s.props.integrity && s.props.src)) {
    return s;
  }
    const setCrossOrigin = { crossOrigin: s.props['crossOrigin'] || s.props['data-crossorigin'] || s.props['crossorigin'] }
    const removePlaceHolders = { ['data-crossorigin']: null, ['crossorigin']: null }
    return React.cloneElement(s, {...setCrossOrigin, ...removePlaceHolders})
};
